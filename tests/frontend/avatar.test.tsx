import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AvatarSettings } from "../../src/components/AvatarSettings";
import { AVATAR_CONSENT_VERSION, requestAvatar, requestVerificationPhoto } from "../../src/lib/avatar";
import type { LocalDocument } from "../../src/lib/onboarding";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 42]);
const verification: LocalDocument = { id: "verification-photo", user_id: "member", kind: "photo", id_type: null, uploaded_at: "2026-01-01", expires_at: "2099-01-01", deleted_at: null };
let decode: ReturnType<typeof vi.fn<() => Promise<void>>>;
let createUrl: ReturnType<typeof vi.fn<(object: Blob | MediaSource) => string>>;
let revokeUrl: ReturnType<typeof vi.fn<(url: string) => void>>;
beforeEach(() => {
  decode = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  let serial = 0;
  createUrl = vi.fn<(object: Blob | MediaSource) => string>(() => `blob:photo-${++serial}`);
  revokeUrl = vi.fn<(url: string) => void>();
  const NativeUrl = URL;
  vi.stubGlobal("URL", class extends NativeUrl { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
  vi.stubGlobal("Image", class { src = ""; decode() { return decode(); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fixture({ saved = false, imageMissing = false, metadataError = false } = {}) {
  let session: { access_token: string; user: { id: string } } | null = { access_token: "test-session", user: { id: "member" } };
  let onAuth: (event: string, next: typeof session) => void = () => {};
  const unsubscribe = vi.fn();
  const getSession = vi.fn(async () => ({ data: { session } }));
  const maybeSingle = vi.fn(async () => ({ data: saved ? { updated_at: "2026-01-01" } : null, error: metadataError ? Error("lookup failed") : null }));
  const eq = vi.fn(() => ({ maybeSingle })), select = vi.fn(() => ({ eq })), from = vi.fn(() => ({ select }));
  const client = { from, auth: { getSession, onAuthStateChange: (callback: typeof onAuth) => { onAuth = callback; return { data: { subscription: { unsubscribe } } }; } } } as unknown as SupabaseClient;
  const fetcher = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    if (String(url).includes("onboarding-document")) return new Response(png, { headers: { "content-type": "application/octet-stream" } });
    if (options?.method === "POST") { saved = true; return new Response("{}", { status: 201 }); }
    if (options?.method === "DELETE") { saved = false; return new Response("{}"); }
    return imageMissing ? new Response("{}", { status: 404 }) : new Response(png, { headers: { "content-type": "image/png" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return { client, fetcher, getSession, from, select, eq, unsubscribe, setSession: (id: string | null, notify = false) => { session = id ? { access_token: `${id}-session`, user: { id } } : null; if (notify) onAuth("SIGNED_IN", session); } };
}
function mount(client: SupabaseClient, photo?: LocalDocument) {
  return render(<MemoryRouter><AvatarSettings client={client} userId="member" name="Test Member" verificationPhoto={photo} /></MemoryRouter>);
}
async function chooseFile(file = new File([png], "chosen.png", { type: "image/png" })) {
  fireEvent.click(await screen.findByRole("button", { name: /^(Add a photo|Change photo)$/ }));
  fireEvent.change(screen.getByLabelText("Upload a new profile photo"), { target: { files: [file] } });
  await screen.findByAltText("Selected photo preview");
  return file;
}
function fileBytes(file: File): Promise<number[]> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(Array.from(new Uint8Array(reader.result as ArrayBuffer))); reader.readAsArrayBuffer(file); });
}

it("previews a selection without saving, then requires consent and explicit Save", async () => {
  const f = fixture(); mount(f.client);
  const file = await chooseFile();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save photo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox")); expect(f.fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save photo" })); await screen.findByText("Profile photo saved.");
  const posts = f.fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(posts[0][1]).toMatchObject({ body: file, cache: "no-store", headers: { "content-type": "image/png", "x-avatar-consent": AVATAR_CONSENT_VERSION, Authorization: "Bearer test-session" } });
  expect(f.from).toHaveBeenCalledWith("member_avatars"); expect(f.select).toHaveBeenCalledWith("updated_at"); expect(f.eq).toHaveBeenCalledWith("user_id", "member");
});

it("Cancel revokes the draft and preserves the saved image without mutation", async () => {
  const f = fixture({ saved: true }); mount(f.client);
  const original = (await screen.findByAltText("Current member profile photo")).getAttribute("src");
  await chooseFile(); const draft = screen.getByAltText("Selected photo preview").getAttribute("src");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByAltText("Selected photo preview")).not.toBeInTheDocument();
  expect(screen.getByAltText("Current member profile photo")).toHaveAttribute("src", original);
  expect(revokeUrl).toHaveBeenCalledWith(draft); expect(revokeUrl).not.toHaveBeenCalledWith(original);
  expect(f.fetcher.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
});

it("distinguishes a missing saved image from an absent avatar row", async () => {
  const f = fixture({ saved: true, imageMissing: true }); const view = mount(f.client);
  await screen.findByText("Photo could not be loaded");
  expect(screen.getByText("Your saved photo has not been removed.")).toBeInTheDocument();
  expect(screen.queryByText("No profile photo yet")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove saved photo" })).toBeEnabled(); view.unmount();
  const empty = fixture(); mount(empty.client);
  await screen.findByText("No profile photo yet"); expect(empty.fetcher).not.toHaveBeenCalled();
});

it("treats metadata lookup failure as unavailable status and disables changes", async () => {
  const f = fixture({ metadataError: true }); mount(f.client);
  await screen.findByText("Photo status unavailable");
  expect(screen.getByRole("button", { name: "Add a photo" })).toBeDisabled(); expect(f.fetcher).not.toHaveBeenCalled();
});

it("requires removal confirmation and Keep photo sends no mutation", async () => {
  const f = fixture({ saved: true }); mount(f.client); await screen.findByAltText("Current member profile photo");
  fireEvent.click(screen.getByRole("button", { name: "Remove saved photo" }));
  expect(f.fetcher.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Keep photo" })); expect(screen.getByAltText("Current member profile photo")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove saved photo" })); fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  await screen.findByText("Profile photo removed. Your initials are shown instead.");
  expect(f.fetcher.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(1); await screen.findByText("No profile photo yet");
});

it("previews exact verification bytes and uploads them as PNG only after consent and Save", async () => {
  const f = fixture(); mount(f.client, verification);
  fireEvent.click(await screen.findByRole("button", { name: "Add a photo" })); fireEvent.click(screen.getByRole("button", { name: /Use my verification photo/ }));
  await screen.findByAltText("Selected photo preview"); expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(String(f.fetcher.mock.calls[0][0])).toContain("onboarding-document?id=verification-photo");
  const previewFile = createUrl.mock.calls[0][0] as File;
  expect(previewFile.type).toBe("image/png"); expect(await fileBytes(previewFile)).toEqual(Array.from(png));
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Save photo" })); await screen.findByText("Profile photo saved.");
  const post = f.fetcher.mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(post[1]?.body).toBe(previewFile); expect(post[1]?.headers).toMatchObject({ "content-type": "image/png", "x-avatar-consent": AVATAR_CONSENT_VERSION });
});

it.each([{ kind: "government_id" as const }, { deleted_at: "2026-01-01" }, { expires_at: "2000-01-01" }, { user_id: "other" }, { uploaded_at: null }])("rejects ineligible verification sources before fetching: %j", async change => {
  const f = fixture(); await expect(requestVerificationPhoto(f.client, "member", { ...verification, ...change })).rejects.toThrow("unavailable");
  expect(f.fetcher).not.toHaveBeenCalled(); expect(f.getSession).not.toHaveBeenCalled();
});

it.each(["POST", "DELETE"])("checks the current session owner inside %s before any fetch", async method => {
  const f = fixture(); f.setSession("other");
  await expect(requestAvatar(f.client, "member", method, method === "POST" ? new File([png], "photo.png", { type: "image/png" }) : undefined)).rejects.toThrow("Sign in");
  expect(f.getSession).toHaveBeenCalledOnce(); expect(f.fetcher).not.toHaveBeenCalled();
});

it("does not fetch private images without a session or verification-owner match", async () => {
  const f = fixture(); f.setSession(null); await expect(requestAvatar(f.client, "member")).rejects.toThrow("Sign in");
  f.setSession("other"); await expect(requestVerificationPhoto(f.client, "member", verification)).rejects.toThrow("Sign in"); expect(f.fetcher).not.toHaveBeenCalled();
});

it("rejects unsupported verification bytes", async () => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response("not an image"));
  await expect(requestVerificationPhoto(f.client, "member", verification)).rejects.toThrow("could not be opened");
});

it("clears image URLs and ignores a delayed preview after the account changes", async () => {
  const f = fixture({ saved: true }); mount(f.client); await screen.findByAltText("Current member profile photo");
  let finishDecode!: () => void; decode.mockImplementationOnce(() => new Promise<void>(resolve => { finishDecode = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Change photo" }));
  fireEvent.change(screen.getByLabelText("Upload a new profile photo"), { target: { files: [new File([png], "pending.png", { type: "image/png" })] } });
  act(() => f.setSession("other", true)); await act(async () => finishDecode());
  expect(screen.getByText("Sign in to your account again to manage your photo.")).toBeInTheDocument();
  expect(screen.queryByAltText("Selected photo preview")).not.toBeInTheDocument(); expect(screen.queryByAltText("Current member profile photo")).not.toBeInTheDocument();
  expect(revokeUrl).toHaveBeenCalledWith("blob:photo-1"); expect(revokeUrl).toHaveBeenCalledWith("blob:photo-2");
  expect(f.fetcher.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
});

it("revokes saved and draft image URLs and unsubscribes on unmount", async () => {
  const f = fixture({ saved: true }); const view = mount(f.client); await screen.findByAltText("Current member profile photo");
  await chooseFile(); view.unmount();
  expect(revokeUrl).toHaveBeenCalledWith("blob:photo-1"); expect(revokeUrl).toHaveBeenCalledWith("blob:photo-2"); expect(f.unsubscribe).toHaveBeenCalledOnce();
});

it("preserves the draft and consent when a save fails", async () => {
  const f = fixture(); mount(f.client); await chooseFile(); fireEvent.click(screen.getByRole("checkbox"));
  f.fetcher.mockResolvedValueOnce(new Response('{"error":"Scanner unavailable"}', { status: 503 }));
  fireEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await screen.findByRole("alert"); expect(screen.getByRole("alert")).toHaveTextContent("Scanner unavailable");
  expect(screen.getByAltText("Selected photo preview")).toBeInTheDocument(); expect(screen.getByRole("checkbox")).toBeChecked();
  await waitFor(() => expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled());
});
