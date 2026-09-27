import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AvatarSettings } from "../../src/components/AvatarSettings";
import { requestAvatar } from "../../src/lib/avatar";
const client = { auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
afterEach(() => vi.unstubAllGlobals());
it("requires explicit consent before reuse or replacement but permits removal", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "unavailable" }), { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  render(<AvatarSettings client={client} userId="member" name="Test Member" />);
  expect(screen.getByRole("button", { name: "Use submitted profile photo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove avatar" })).toBeEnabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Use submitted profile photo" })).toBeEnabled();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
});
it("does not fetch an avatar without a session", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const signedOut = { auth: { getSession: async () => ({ data: { session: null } }) } } as unknown as SupabaseClient;
  await expect(requestAvatar(signedOut, "member")).rejects.toThrow("Sign in");
  expect(fetcher).not.toHaveBeenCalled();
});
it("includes separate consent for reuse and never requests an ID", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 201 })); vi.stubGlobal("fetch", fetcher);
  await requestAvatar(client, "member", "POST");
  const options = fetcher.mock.calls[0][1];
  expect(JSON.parse(options.body)).toEqual({ use_profile_photo: true, consent_version: "2026-09-27-avatar-1" });
  expect(options.cache).toBe("no-store");
});
