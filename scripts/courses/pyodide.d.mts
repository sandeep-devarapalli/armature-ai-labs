export const manifest: { version: string; python: string; packages: string[]; source: string; files: Record<string, string> };
export const pyodideDir: string;
export const pyodidePrefix: string;
export function readVerifiedPyodide(dir?: string): Promise<{ name: string; data: Buffer }[]>;
