const backendUrl = process.env.PLAYWRIGHT_PREBUILT === "true"
  ? process.env.VITE_SUPABASE_URL
  : "https://reserved.invalid";
if (!backendUrl) throw new Error("Prebuilt membership tests require VITE_SUPABASE_URL from the build environment");
export const backendOrigin = new URL(backendUrl).origin;
export const authStorageKey = `sb-${new URL(backendOrigin).hostname.split(".")[0]}-auth-token`;
