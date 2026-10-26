import { act, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { AppProvider, useApp } from "../../src/context/AppContext";
import { initialDemoState } from "../../src/data/demo";

const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadSnapshot: vi.fn(),
  change: (_event: string, _session: Session | null) => {},
}));

vi.mock("../../src/lib/supabase", () => ({
  dataMode: "supabase",
  googleAuthEnabled: true,
  supabase: { auth: {
    getSession: mock.getSession,
    onAuthStateChange: (change: typeof mock.change) => {
      mock.change = change;
      change("INITIAL_SESSION", null);
      return { data: { subscription: { unsubscribe() {} } } };
    },
  } },
}));
vi.mock("../../src/lib/liveData", () => ({ loadLiveSnapshot: mock.loadSnapshot }));

function Probe() {
  const { state, loading, isAdmin, isStaff } = useApp();
  return <output>{`${loading ? "loading" : "ready"}:${state.currentUserId ?? "anonymous"}:${isAdmin}:${isStaff}`}</output>;
}
const session = (id: string) => ({ user: { id }, access_token: `synthetic-${id}` }) as Session;
function snapshot(value: Session | null) {
  return {
    state: { ...initialDemoState, currentUserId: value?.user.id ?? null },
    isAdmin: value?.user.id === "admin",
    isStaff: value?.user.id === "admin",
  };
}

beforeEach(() => {
  mock.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  mock.loadSnapshot.mockReset().mockImplementation(async (_client, value) => snapshot(value));
});

it("loads one initial public snapshot despite the initial auth notification", async () => {
  render(<AppProvider><Probe /></AppProvider>);
  await screen.findByText("ready:anonymous:false:false");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(mock.loadSnapshot).toHaveBeenCalledTimes(1);
  expect(mock.loadSnapshot.mock.calls[0][1]).toBeNull();
});

it("still hydrates sign-in, token refresh, user updates and sign-out", async () => {
  render(<AppProvider><Probe /></AppProvider>);
  await screen.findByText("ready:anonymous:false:false");
  for (const [event, value] of [
    ["SIGNED_IN", session("admin")],
    ["TOKEN_REFRESHED", session("admin")],
    ["USER_UPDATED", session("member")],
    ["SIGNED_OUT", null],
  ] as const) {
    const calls = mock.loadSnapshot.mock.calls.length;
    act(() => mock.change(event, value));
    await waitFor(() => expect(mock.loadSnapshot).toHaveBeenCalledTimes(calls + 1));
    await screen.findByText(`ready:${value?.user.id ?? "anonymous"}:${value?.user.id === "admin"}:${value?.user.id === "admin"}`);
    expect(mock.loadSnapshot.mock.calls.at(-1)?.[1]).toBe(value);
  }
});

it("clears staff authority while an actual auth refresh is pending", async () => {
  mock.getSession.mockResolvedValue({ data: { session: session("admin") }, error: null });
  render(<AppProvider><Probe /></AppProvider>);
  await screen.findByText("ready:admin:true:true");
  let resolveSnapshot: (value: ReturnType<typeof snapshot>) => void = () => {};
  mock.loadSnapshot.mockImplementationOnce(() => new Promise(resolve => { resolveSnapshot = resolve; }));
  act(() => mock.change("USER_UPDATED", session("member")));
  await screen.findByText("loading:admin:false:false");
  await act(async () => resolveSnapshot(snapshot(session("member"))));
  await screen.findByText("ready:member:false:false");
});
