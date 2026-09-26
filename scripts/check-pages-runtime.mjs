import { spawn } from "node:child_process";
import { once } from "node:events";

const runtime = spawn(process.execPath, [
  "node_modules/wrangler/bin/wrangler.js",
  "pages",
  "dev",
  "dist",
  "--port",
  "8788",
  "--compatibility-date=2026-08-08"
], { stdio: ["ignore", "pipe", "pipe"] });
let runtimeOutput = "";
runtime.stdout.on("data", (chunk) => { runtimeOutput += chunk; });
runtime.stderr.on("data", (chunk) => { runtimeOutput += chunk; });

async function waitForRuntime() {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    if (runtime.exitCode !== null) {
      throw new Error(`Cloudflare Pages runtime exited early.\n${runtimeOutput}`);
    }
    try {
      await fetch("http://127.0.0.1:8788/", {
        signal: AbortSignal.timeout(1_000)
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Cloudflare Pages runtime did not become ready.\n${runtimeOutput}`);
}

async function runSmokeCheck() {
  for (const script of ["scripts/check-live-release.mjs", "scripts/check-seo-http.mjs"]) {
    const check = spawn(process.execPath, [script, "http://127.0.0.1:8788"], { stdio: "inherit" });
    const [code] = await once(check, "exit");
    if (code !== 0) throw new Error(`${script} exited with code ${code}.`);
  }
}

try {
  await waitForRuntime();
  await runSmokeCheck();
} finally {
  if (runtime.exitCode === null) {
    runtime.kill("SIGTERM");
    await Promise.race([
      once(runtime, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3_000))
    ]);
  }
  if (runtime.exitCode === null) runtime.kill("SIGKILL");
}
