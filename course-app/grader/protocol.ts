export interface GraderFile { name: string; text?: string; base64?: string }
export interface TestResult { test: string; outcome: 'passed' | 'failed' | 'skipped' | string; seconds: number; message: string }
export type ToWorker = { type: 'run'; id: number; base: string; packages: string[]; files: GraderFile[]; tests: string[] };
export type FromWorker =
  | { type: 'status'; id: number; text: string }
  | { type: 'ready'; id: number; python: string }
  | { type: 'result'; id: number; results: TestResult[]; seconds: number }
  | { type: 'error'; id: number; message: string };
