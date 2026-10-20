import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DirectoryProfileSettingsPage, MembersDirectoryPage, PublicDirectoryProfilePage } from "../../src/pages/PeopleGalleryPage";
const person = { id: "11111111-1111-4111-8111-111111111111", display_name: "Synthetic Builder", bio: "Making robot hands.", skills: ["Robotics"], has_avatar: false };
const wrap = (element: React.ReactNode) => render(<MemoryRouter>{element}</MemoryRouter>);
describe("People gallery", () => {
  it("renders only public fields and sends explicit paginated searches", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { items: [person], total: 1 }, error: null });
    wrap(<MembersDirectoryPage client={{ rpc } as unknown as SupabaseClient} />);
    expect(await screen.findByRole("heading", { name: person.display_name })).toBeVisible();
    expect(screen.getByRole("link", { name: /View profile/ })).toHaveAttribute("href", `/members/${person.id}`);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: " Robotics " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith("list_public_member_profiles", { p_search: "Robotics", p_page: 1, p_page_size: 24 }));
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
  it("shows empty state without invented members and retries failures", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { message: "private database error" } }).mockResolvedValue({ data: { items: [], total: 0 }, error: null });
    wrap(<MembersDirectoryPage client={{ rpc } as unknown as SupabaseClient} />);
    expect(await screen.findByRole("alert")).not.toHaveTextContent("private database error");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("A community, taking shape.")).toBeVisible();
    expect(screen.queryByText(person.display_name)).not.toBeInTheDocument();
  });
  it("does not retain a previous profile when a new profile is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    render(<MemoryRouter initialEntries={[`/members/${person.id}`]}><Routes><Route path="/members/:handle" element={<PublicDirectoryProfilePage client={{ rpc } as unknown as SupabaseClient} />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("Profile not available")).toBeVisible();
  });
});
function settingsFixture() {
  let callback: (event: string, session: unknown) => void = () => {};
  const own = { ...person, published: false, share_avatar: false, avatar_available: true, avatar_revision: "old-avatar-revision" };
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => ({ data: name === "get_my_directory_profile" ? own : { ...own, published: args?.p_published, share_avatar: args?.p_share_avatar }, error: null }));
  const client = { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: "synthetic" } } } }), onAuthStateChange: (cb: typeof callback) => { callback = cb; return { data: { subscription: { unsubscribe() {} } } }; } } } as unknown as SupabaseClient;
  return { client, rpc, authEvent: (callbackValue: { event: string; session: unknown }) => callback(callbackValue.event, callbackValue.session), switchAccount: () => callback("SIGNED_OUT", null) };
}
it("keeps publication and photo consent separate and can hide a profile", async () => {
  const { client, rpc } = settingsFixture(); wrap(<DirectoryProfileSettingsPage client={client} />);
  const publish = await screen.findByRole("checkbox", { name: /I want my name/ });
  const photo = screen.getByRole("checkbox", { name: /I also allow/ });
  expect(publish).not.toBeChecked(); expect(photo).not.toBeChecked();
  fireEvent.click(publish); fireEvent.click(screen.getByRole("button", { name: "Save profile choices" }));
  expect(await screen.findByRole("status")).toHaveTextContent("now visible");
  expect(rpc).toHaveBeenLastCalledWith("save_my_directory_profile_with_contacts", expect.objectContaining({ p_published: true, p_share_avatar: false, p_avatar_revision: "old-avatar-revision", p_consent_version: "2026-10-20-public-directory-v1" }));
  fireEvent.change(screen.getByLabelText("Public name"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Hide my public profile" }));
  expect(await screen.findByRole("status")).toHaveTextContent("profile is private");
  expect(rpc).toHaveBeenLastCalledWith("hide_my_directory_profile");
});
it("clears private settings on sign out", async () => {
  const fixture = settingsFixture(); wrap(<DirectoryProfileSettingsPage client={fixture.client} />);
  await screen.findByDisplayValue(person.display_name);
  await act(async () => { fixture.switchAccount(); await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(await screen.findByText(/Sign in to manage your public profile/)).toBeVisible();
  expect(screen.queryByDisplayValue(person.display_name)).not.toBeInTheDocument();
});

it("preserves edits on token refresh and blocks an old form during account switching", async () => {
  const fixture = settingsFixture(); wrap(<DirectoryProfileSettingsPage client={fixture.client} />);
  const name = await screen.findByLabelText("Public name");
  fireEvent.change(name, { target: { value: "Unsaved name" } });
  await act(async () => { fixture.authEvent({ event: "TOKEN_REFRESHED", session: { user: { id: "synthetic" } } }); });
  expect(name).toHaveValue("Unsaved name");
  const callsBeforeSwitch = fixture.rpc.mock.calls.length;
  act(() => {
    fixture.authEvent({ event: "SIGNED_IN", session: { user: { id: "another-user" } } });
    fireEvent.submit(name.closest("form")!);
  });
  expect(fixture.rpc.mock.calls.slice(callsBeforeSwitch).some(([rpc]) => rpc === "save_my_directory_profile_with_contacts")).toBe(false);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
});

it("renders only opted-in public contact links", async () => {
 const rpc = vi.fn().mockResolvedValue({data:{items:[{...person,public_email:"contact@example.test",linkedin_url:"https://www.linkedin.com/in/builder"}],total:1},error:null});
 wrap(<MembersDirectoryPage client={{rpc} as unknown as SupabaseClient}/>);
 expect(await screen.findByRole("link",{name:"Email"})).toHaveAttribute("href","mailto:contact%40example.test");
 expect(screen.getByRole("link",{name:/LinkedIn/})).toHaveAttribute("rel","noopener noreferrer");
});
it("defaults contacts to private and requires a fresh sharing choice after edits", async () => {
 const {client,rpc}=settingsFixture(); wrap(<DirectoryProfileSettingsPage client={client}/>);
 const source=await screen.findByLabelText("Public email"); expect(source).toHaveValue("none");
 const consent=screen.getByRole("checkbox",{name:/I allow the email/}); expect(consent).not.toBeChecked();
 fireEvent.change(source,{target:{value:"custom"}});
 fireEvent.change(screen.getByLabelText("Public contact email"),{target:{value:"contact@example.test"}});
 fireEvent.click(consent);
 fireEvent.change(screen.getByLabelText("Public LinkedIn profile URL (optional)"),{target:{value:"https://linkedin.com/in/builder"}});
 expect(consent).not.toBeChecked(); fireEvent.click(consent);
 fireEvent.click(screen.getByRole("button",{name:"Save profile choices"}));
 await waitFor(()=>expect(rpc).toHaveBeenLastCalledWith("save_my_directory_profile_with_contacts",expect.objectContaining({p_email_source:"custom",p_public_email:"contact@example.test",p_contact_consent:true})));
});

it("saves unchecked contact permission without discarding the private choices", async () => {
 const {client,rpc}=settingsFixture(); wrap(<DirectoryProfileSettingsPage client={client}/>);
 await screen.findByLabelText("Public name");
 fireEvent.change(screen.getByLabelText("Public email"),{target:{value:"custom"}});
 fireEvent.change(screen.getByLabelText("Public contact email"),{target:{value:"private@example.test"}});
 fireEvent.click(screen.getByRole("button",{name:"Save profile choices"}));
 await waitFor(()=>expect(rpc).toHaveBeenLastCalledWith("save_my_directory_profile_with_contacts",expect.objectContaining({p_email_source:"custom",p_public_email:"private@example.test",p_contact_consent:false})));
});
