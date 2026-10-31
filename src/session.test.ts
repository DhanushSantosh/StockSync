import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  clear: vi.fn(),
  terminate: vi.fn(),
  pending: vi.fn(),
  signOut: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  clearIndexedDbPersistence: calls.clear,
  terminate: calls.terminate,
  waitForPendingWrites: calls.pending,
}));
vi.mock("firebase/auth", () => ({ signOut: calls.signOut }));
vi.mock("./firebase", () => ({ auth: {}, db: {} }));
vi.mock("./shop", () => ({}));

import { signOutOfDevice } from "./session";

describe("device sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.pending.mockResolvedValue(undefined);
    calls.terminate.mockResolvedValue(undefined);
    calls.clear.mockResolvedValue(undefined);
    calls.signOut.mockResolvedValue(undefined);
    vi.stubGlobal("location", { reload: calls.reload });
  });

  it("blocks sign-out when the browser cache cannot be cleared", async () => {
    calls.clear.mockRejectedValue(new Error("another tab is open"));
    await expect(signOutOfDevice()).rejects.toThrow(/Close other StockSync tabs/);
    expect(calls.terminate).toHaveBeenCalledOnce();
    expect(calls.signOut).not.toHaveBeenCalled();
    expect(calls.reload).not.toHaveBeenCalled();
  });

  it("clears the cache before signing out", async () => {
    await signOutOfDevice();
    expect(calls.clear).toHaveBeenCalledOnce();
    expect(calls.signOut).toHaveBeenCalledOnce();
    expect(calls.clear.mock.invocationCallOrder[0]).toBeLessThan(
      calls.signOut.mock.invocationCallOrder[0],
    );
    expect(calls.reload).toHaveBeenCalledOnce();
  });
});
