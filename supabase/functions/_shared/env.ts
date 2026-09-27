import { HttpError } from "./http.ts";

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function assertJobSecret(request: Request, variable = "ARMATURE_JOB_SECRET"): void {
  const expected = requiredEnv(variable);
  const supplied = request.headers.get("x-armature-job-secret") ?? "";

  if (!constantTimeEqual(expected, supplied)) {
    throw new HttpError(401, "Invalid job credential.", "invalid_job_secret");
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |=
      (leftBytes[index % Math.max(leftBytes.length, 1)] ?? 0) ^
      (rightBytes[index % Math.max(rightBytes.length, 1)] ?? 0);
  }

  return mismatch === 0;
}
