import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);
const retiredCopy = /\bcages?\b|drone-cage|floor-drone|res-drone/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

describe("retired site copy", () => {
  it("does not appear anywhere in the shipped application source", () => {
    const offenders = sourceFiles(sourceRoot)
      .filter((path) => retiredCopy.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(sourceRoot.length + 1));

    expect(offenders).toEqual([]);
  });
});
