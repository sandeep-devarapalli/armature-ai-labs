import { PYODIDE_BASE } from './runtime';
import type { FromWorker, GraderFile, TestResult, ToWorker } from './protocol';

export type { GraderFile, TestResult } from './protocol';
export interface RunRequest { files: GraderFile[]; tests: string[]; packages: string[]; timeLimitSeconds: number; onStatus?: (text: string) => void }
export interface RunOutcome { results: TestResult[]; seconds: number; python: string }
export interface Grader { run(request: RunRequest): Promise<RunOutcome>; dispose(): void }

export class GraderError extends Error {
  constructor(message: string, readonly kind: 'timeout' | 'runtime' | 'unsupported') { super(message); }
}

// One worker per page, kept alive between runs so Python loads once. A run that passes its time limit
// terminates the worker (the only way to stop a runaway loop); the next run starts a fresh one.
export function createGrader(makeWorker: () => Worker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'grader' })): Grader {
  let worker: Worker | null = null;
  let next = 1;
  let busy = false;
  let firstRun = true;
  return {
    run(request) {
      if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return Promise.reject(new GraderError('This browser cannot run Python here. Download the files and run pytest on your computer.', 'unsupported'));
      if (busy) return Promise.reject(new GraderError('A run is already in progress.', 'runtime'));
      busy = true;
      const id = next++;
      // The first run includes downloading and starting Python, so it gets extra time.
      const limit = (request.timeLimitSeconds + (firstRun ? 180 : 20)) * 1000;
      return new Promise<RunOutcome>((resolve, reject) => {
        let python = '';
        try { worker ??= makeWorker(); } catch { busy = false; reject(new GraderError('This browser cannot start the Python runner. Download the files and run pytest on your computer.', 'unsupported')); return; }
        const current = worker;
        const finish = () => { busy = false; clearTimeout(timer); current.removeEventListener('message', onMessage); current.removeEventListener('error', onError); };
        const timer = setTimeout(() => {
          finish(); current.terminate(); if (worker === current) worker = null;
          reject(new GraderError(`The tests did not finish within ${Math.round(limit / 1000)} seconds, so the run was stopped. Look for a loop that never ends, or work that is far slower than it needs to be.`, 'timeout'));
        }, limit);
        const onError = () => { finish(); current.terminate(); if (worker === current) worker = null; reject(new GraderError('The Python runner could not start in this browser. Download the files and run pytest on your computer.', 'runtime')); };
        const onMessage = ({ data }: MessageEvent<FromWorker>) => {
          if (data.id !== id) return;
          if (data.type === 'status') request.onStatus?.(data.text);
          else if (data.type === 'ready') { python = data.python; firstRun = false; }
          else if (data.type === 'result') { finish(); resolve({ results: data.results, seconds: data.seconds, python }); }
          else if (data.type === 'error') { finish(); reject(new GraderError(data.message, 'runtime')); }
        };
        current.addEventListener('message', onMessage);
        current.addEventListener('error', onError);
        const message: ToWorker = { type: 'run', id, base: PYODIDE_BASE, packages: request.packages, files: request.files, tests: request.tests };
        current.postMessage(message);
      });
    },
    dispose() { worker?.terminate(); worker = null; },
  };
}

let shared: Grader | null = null;
export function sharedGrader() { return (shared ??= createGrader()); }
