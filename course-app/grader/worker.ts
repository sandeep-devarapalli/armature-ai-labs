// Dedicated module worker that runs pytest under Pyodide. It is served from /grader/ with its own Content Security
// Policy (eval and WebAssembly compilation allowed, network limited to this site), so the lesson page keeps its strict policy.
import runnerSource from './runner.py?raw';
import type { FromWorker, ToWorker } from './protocol';

interface PyProxy { toJs?: () => unknown; destroy?: () => void }
interface Pyodide {
  loadPackage(names: string[], options?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void }): Promise<unknown>;
  runPython(code: string): unknown;
  globals: { get(name: string): ((...args: unknown[]) => unknown) & PyProxy };
  toPy(value: unknown): PyProxy;
  FS: { writeFile(path: string, data: string | Uint8Array): void };
}
const scope = self as unknown as { postMessage(message: FromWorker): void; onmessage: ((event: MessageEvent<ToWorker>) => void) | null };
let runtime: Promise<{ py: Pyodide; python: string }> | null = null;
let loaded = new Set<string>();

function boot(base: string, id: number) {
  return (async () => {
    scope.postMessage({ type: 'status', id, text: 'Downloading Python (about 33 MB the first time; later visits use the browser cache)…' });
    const module = await import(/* @vite-ignore */ `${base}pyodide.mjs`) as { loadPyodide(options: { indexURL: string; stdout?: (s: string) => void; stderr?: (s: string) => void }): Promise<Pyodide> };
    const py = await module.loadPyodide({ indexURL: base, stdout: () => {}, stderr: () => {} });
    py.runPython(runnerSource);
    const python = String(py.runPython('import sys; f"{sys.version_info[0]}.{sys.version_info[1]}"'));
    return { py, python };
  })();
}

function bytes(base64: string) {
  const raw = atob(base64); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

scope.onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  const { id } = data;
  try {
    runtime ??= boot(data.base, id);
    const { py, python } = await runtime;
    const wanted = ['pytest', ...data.packages].filter(name => !loaded.has(name));
    if (wanted.length) {
      scope.postMessage({ type: 'status', id, text: `Loading ${wanted.join(', ')}…` });
      await py.loadPackage(wanted, { messageCallback: () => {}, errorCallback: () => {} });
      loaded = new Set([...loaded, ...wanted]);
    }
    scope.postMessage({ type: 'ready', id, python });
    scope.postMessage({ type: 'status', id, text: 'Running tests…' });
    py.runPython('reset_work()');
    for (const file of data.files) py.FS.writeFile(`/work/${file.name}`, file.base64 !== undefined ? bytes(file.base64) : file.text ?? '');
    const started = performance.now();
    const run = py.globals.get('run');
    const arg = py.toPy(data.tests);
    const json = String(run(arg));
    arg.destroy?.(); run.destroy?.();
    scope.postMessage({ type: 'result', id, results: JSON.parse(json), seconds: (performance.now() - started) / 1000 });
  } catch (error) {
    if (String(error).includes('pyodide.mjs') || String(error).includes('Failed to fetch')) runtime = null;
    scope.postMessage({ type: 'error', id, message: String((error as Error)?.message ?? error).slice(-2000) });
  }
};
