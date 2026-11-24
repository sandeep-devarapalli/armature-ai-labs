import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CodeAssignment, { GraderContext } from '../../course-app/CodeAssignment';
import { AssignmentStoreContext, type AssignmentStore } from '../../course-app/assignment-store';
import { createGrader, GraderError, type Grader, type RunRequest } from '../../course-app/grader/client';
import { PYODIDE_BASE, PYODIDE_VERSION, PYODIDE_PYTHON } from '../../course-app/grader/runtime';
import { crc32, zip } from '../../course-app/grader/zip';
import { courseHostingAssets, graderCsp } from '../../scripts/courses/release-config.mjs';
import manifest from '../../scripts/courses/pyodide-manifest.json';
import type { Block } from '../../course-app/types';
import type { AssignmentWork } from '../../course-app/member-api';

const block: Block = { id: 'a1', type: 'code_assignment', content: {
  title: 'Assignment 9: Bin clearing', briefHtml: '<p>Clear the bin.</p>', python: '3.14', packages: ['numpy'], timeLimitSeconds: 60,
  files: [{ name: 'bins.py', code: 'def crop():\n    raise NotImplementedError\n', editable: true }, { name: 'bin_world.py', code: 'BIN_W = 0.32\n', editable: false }],
  tests: [{ name: 'test_visible.py', code: 'def test_a():\n    pass\n', hidden: false }, { name: 'test_hidden.py', code: 'SECRET = 1\n', hidden: true }],
  support: [{ name: 'reference_bin.pyc', base64: 'AAAA' }],
} };

function fakeGrader(results: (r: RunRequest) => { test: string; outcome: string; message: string }[]) {
  const requests: RunRequest[] = [];
  const grader: Grader = { run: vi.fn(async (r: RunRequest) => { requests.push(r); r.onStatus?.('Running tests…'); return { results: results(r).map(x => ({ seconds: 0.1, ...x })), seconds: 1.5, python: '3.14' }; }), dispose: vi.fn() };
  return { grader, requests };
}
function memoryStore(initial: AssignmentWork | null = null) {
  let work = initial;
  const store: AssignmentStore & { saves: unknown[] } = {
    saves: [],
    load: vi.fn(async () => work),
    save: vi.fn(async (blockId, files, result, revision) => {
      store.saves.push({ blockId, files, result, revision });
      const best = result?.kind === 'all' && (!work?.best || result.passed / result.total > work.best.passed / work.best.total) ? { passed: result.passed, total: result.total, at: '2026-11-24T10:00:00Z' } : work?.best ?? null;
      work = { lessonId: 'l', blockId, files, revision: (work?.revision ?? 0) + 1, updatedAt: 'now', best, last: result ? { ...result, at: '2026-11-24T10:00:00Z' } : work?.last ?? null };
      return work;
    }),
  };
  return store;
}
const mount = (grader: Grader, store: AssignmentStore | null) => render(<GraderContext.Provider value={() => grader}>
  <AssignmentStoreContext.Provider value={store}><CodeAssignment block={block} /></AssignmentStoreContext.Provider></GraderContext.Provider>);

it('keeps the runtime version, manifest and hosting headers in step', () => {
  expect(manifest.version).toBe(PYODIDE_VERSION);
  expect(manifest.python).toBe(PYODIDE_PYTHON);
  expect(PYODIDE_BASE).toBe(`/pyodide/${manifest.version}/`);
  expect(Object.keys(manifest.files)).toEqual(expect.arrayContaining(['pyodide.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']));
  const headers = courseHostingAssets('https://example.supabase.co')['_headers'];
  expect(headers).toContain(`/grader/*\n  ! Content-Security-Policy\n  Content-Security-Policy: ${graderCsp}\n`);
  expect(headers.indexOf('/grader/*')).toBeGreaterThan(headers.indexOf('/*\n'));
  expect(graderCsp).not.toMatch(/https?:|\*/);
  expect(headers.split('\n').find(line => line.startsWith('  Content-Security-Policy: default-src \'self\''))).not.toContain('unsafe-eval');
});

it('shows only the learner files and visible tests, runs visible tests without hidden files, and saves the score', async () => {
  const { grader, requests } = fakeGrader(() => [{ test: 'test_visible.py::test_a', outcome: 'failed', message: 'AssertionError: crop kept the wall' }]);
  const store = memoryStore();
  mount(grader, store);
  await screen.findByRole('tab', { name: /bins\.py/ });
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['bins.pyyour code', 'bin_world.pyprovided', 'test_visible.pytests']);
  expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'def crop():\n    return 1\n' } });
  fireEvent.click(screen.getByText('Run visible tests'));
  await screen.findByText(/Visible tests: 0 of 1 passed/);
  expect(screen.getByText('AssertionError: crop kept the wall')).toBeInTheDocument();
  const sent = requests[0];
  expect(sent.tests).toEqual(['test_visible.py']);
  expect(sent.files.map(f => f.name)).toEqual(['bins.py', 'bin_world.py', 'test_visible.py']);
  expect(sent.files[0].text).toBe('def crop():\n    return 1\n');
  expect(sent.packages).toEqual(['numpy']); expect(sent.timeLimitSeconds).toBe(60);
  await waitFor(() => expect(store.saves).toContainEqual({ blockId: 'a1', files: { 'bins.py': 'def crop():\n    return 1\n' }, result: { kind: 'visible', passed: 0, total: 1 }, revision: null }));
  await screen.findByText('Code saved.');
});

it('grades with hidden tests and support files but never shows hidden messages', async () => {
  const { grader, requests } = fakeGrader(() => [{ test: 'test_visible.py::test_a', outcome: 'passed', message: '' }, { test: 'test_hidden.py::test_two_bins', outcome: 'failed', message: 'assert SECRET == 2' }]);
  const store = memoryStore();
  mount(grader, store);
  fireEvent.click(await screen.findByText('Grade with all tests'));
  await screen.findByText(/Graded with all tests: 1 of 2 passed/);
  expect(requests[0].tests).toEqual(['test_visible.py', 'test_hidden.py']);
  expect(requests[0].files.find(f => f.name === 'reference_bin.pyc')).toEqual({ name: 'reference_bin.pyc', base64: 'AAAA' });
  expect(screen.getByText('two bins')).toBeInTheDocument();
  expect(screen.queryByText(/assert SECRET/)).not.toBeInTheDocument();
  await screen.findByText(/1 of 2 tests \(/);
});

it('restores saved code, keeps the best score and resets a file only after confirmation', async () => {
  const { grader } = fakeGrader(() => []);
  const store = memoryStore({ lessonId: 'l', blockId: 'a1', files: { 'bins.py': 'saved = True\n', 'evil.py': 'x' }, revision: 3, updatedAt: 'now',
    best: { passed: 5, total: 6, at: '2026-11-20T10:00:00Z' }, last: { kind: 'visible', passed: 2, total: 3, at: '2026-11-21T10:00:00Z' } });
  mount(grader, store);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('saved = True\n'));
  expect(screen.getByText(/5 of 6 tests/)).toBeInTheDocument();
  expect(screen.getByText('2 of 3 visible tests')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Reset bins.py to the starter'));
  expect(screen.getByRole('textbox')).toHaveValue('saved = True\n');
  fireEvent.click(screen.getByText('Yes, reset bins.py'));
  expect(screen.getByRole('textbox')).toHaveValue('def crop():\n    raise NotImplementedError\n');
});

it('autosaves edits after a pause and reports a conflict from another window', async () => {
  vi.useFakeTimers();
  try {
    const { grader } = fakeGrader(() => []);
    const store = memoryStore();
    store.save = vi.fn(async () => { throw Object.assign(new Error('changed'), { code: 'PT409' }); });
    mount(grader, store);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x = 1\n' } });
    expect(screen.getByText('Unsaved changes…')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1600); await Promise.resolve(); await Promise.resolve(); });
    expect(store.save).toHaveBeenCalledWith('a1', { 'bins.py': 'x = 1\n' }, null, null);
    expect(screen.getByText(/changed in another window/)).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('runs without saving when there is no store, and Tab indents', async () => {
  const { grader } = fakeGrader(() => [{ test: 'test_visible.py::test_a', outcome: 'passed', message: '' }]);
  mount(grader, null);
  expect(screen.getByText(/Enroll to keep your code between visits/)).toBeInTheDocument();
  const area = screen.getByRole('textbox') as HTMLTextAreaElement;
  area.setSelectionRange(0, 0);
  fireEvent.keyDown(area, { key: 'Tab' });
  expect(area.value.startsWith('    def crop')).toBe(true);
  fireEvent.click(screen.getByText('Run visible tests'));
  await screen.findByText('Every visible test passes. Grade with all tests to check the hidden cases.');
});

it('explains a run that hits its time limit', async () => {
  const grader: Grader = { run: vi.fn(async () => { throw new GraderError('The tests did not finish within 80 seconds, so the run was stopped.', 'timeout'); }), dispose: vi.fn() };
  mount(grader, null);
  fireEvent.click(screen.getByText('Run visible tests'));
  expect(await screen.findByRole('alert')).toHaveTextContent('did not finish within 80 seconds');
});

it('terminates a runaway worker at the time limit and starts a fresh one next time', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', class {});
  try {
    const workers: { terminate: ReturnType<typeof vi.fn>; posted: unknown[] }[] = [];
    const make = () => {
      const w = { posted: [] as unknown[], terminate: vi.fn(), listeners: {} as Record<string, (e: unknown) => void>,
        addEventListener(type: string, fn: (e: unknown) => void) { this.listeners[type] = fn; }, removeEventListener() {},
        postMessage(m: { id: number }) { this.posted.push(m); } };
      workers.push(w); return w as unknown as Worker;
    };
    const grader = createGrader(make);
    const first = grader.run({ files: [], tests: ['test_visible.py'], packages: [], timeLimitSeconds: 10 });
    const caught = first.catch(e => e);
    await vi.advanceTimersByTimeAsync(191_000);
    expect(await caught).toBeInstanceOf(GraderError);
    expect(workers[0].terminate).toHaveBeenCalled();
    void grader.run({ files: [], tests: [], packages: [], timeLimitSeconds: 10 }).catch(() => {});
    expect(workers).toHaveLength(2);
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});

it('writes a zip that standard tools can read', () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  const bytes = zip([{ name: 'a.py', text: 'print(1)\n' }]);
  expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  expect([...bytes.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
});
