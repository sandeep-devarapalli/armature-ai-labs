import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "../../src/context/AppContext";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), getSession: vi.fn(),
  authChange: (_event: string, _session: unknown) => {},
}));
vi.mock("../../src/lib/liveData", () => ({ loadLiveSnapshot: mocks.load }));
vi.mock("../../src/lib/supabase", () => ({
  dataMode: "supabase", googleAuthEnabled: false,
  supabase: { auth: {
    getSession: mocks.getSession,
    onAuthStateChange: (callback: typeof mocks.authChange) => {
      mocks.authChange = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  } },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function snapshot(id: string, admin = false) {
  return { state: {
    currentUserId: id, profiles: [], resources: [], bookings: [], attendance: [],
    checkinIntents: [], applications: [], calendarSync: [],
  }, isStaff: admin, isAdmin: admin, teamAccess: [{ organizationName: `${id} private team` }] };
}
function Probe() {
  const { state, isAdmin, teamAccess, loading, notice, refresh } = useApp();
  return <><output>{JSON.stringify({ user: state.currentUserId, isAdmin, teamAccess, loading, notice })}</output>
    <button onClick={() => void refresh()}>Refresh</button></>;
}
function value() { return JSON.parse(screen.getByRole("status").textContent ?? "{}"); }
beforeEach(() => {
  mocks.load.mockReset(); mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "admin-a" } } }, error: null });
});

it.each(["success", "failure"])("discards stale hydration %s and clears private state on account switch", async (outcome) => {
  mocks.load.mockResolvedValueOnce(snapshot("admin-a", true));
  render(<AppProvider><Probe /></AppProvider>);
  await waitFor(() => expect(value().isAdmin).toBe(true));
  const old = deferred<ReturnType<typeof snapshot>>();
  const next = deferred<ReturnType<typeof snapshot>>();
  mocks.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  fireEvent.click(screen.getByText("Refresh"));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  act(() => mocks.authChange("SIGNED_IN", { user: { id: "member-b" } }));
  expect(value()).toEqual({ user: null, isAdmin: false, teamAccess: [], loading: true, notice: "" });
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
  await act(async () => {
    if (outcome === "success") old.resolve(snapshot("admin-a", true));
    else old.reject(new Error("Old administrator failure"));
  });
  expect(value()).toEqual({ user: null, isAdmin: false, teamAccess: [], loading: true, notice: "" });
  await act(async () => next.resolve(snapshot("member-b")));
  expect(value().user).toBe("member-b");
  expect(value().isAdmin).toBe(false);
  expect(value().loading).toBe(false);
  expect(value().notice).toBe("");
});

it("ignores an initial session response overtaken by an auth event", async () => {
  const initial = deferred<unknown>();
  mocks.getSession.mockReturnValue(initial.promise);
  mocks.load.mockResolvedValue(snapshot("member-b"));
  render(<AppProvider><Probe /></AppProvider>);
  act(() => mocks.authChange("SIGNED_IN", { user: { id: "member-b" } }));
  await waitFor(() => expect(value().user).toBe("member-b"));
  await act(async () => initial.resolve({ data: { session: { user: { id: "admin-a" } } }, error: null }));
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(value().user).toBe("member-b");
});
