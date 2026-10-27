import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./api";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const config = {
  supabaseUrl: "https://test.invalid",
  supabaseAnonKey: "public-test-key",
};
describe("React API client", () => {
  it("initializes once under repeated React effects", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(config));
    vi.stubGlobal("fetch", fetcher);
    const client = new ApiClient(vi.fn());
    expect(
      await Promise.all([client.initialize(), client.initialize()]),
    ).toEqual(["signedout", "signedout"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refreshes and retries once, then expires a rejected session", async () => {
    const expired = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(config))
      .mockResolvedValueOnce(json({ error: "expired" }, 401))
      .mockResolvedValueOnce(
        json({
          access_token: "renewed",
          refresh_token: "refresh",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(json({ error: "rejected" }, 401));
    vi.stubGlobal("fetch", fetcher);
    const client = new ApiClient(expired);
    await client.initialize();
    client.sessions.save({
      access_token: "old",
      refresh_token: "refresh",
      expires_in: 3600,
    });
    await expect(client.api("/api/documents")).rejects.toThrow(
      "Your session has expired",
    );
    expect(expired).toHaveBeenCalledOnce();
    expect(client.sessions.read()).toBeNull();
  });
  it("rejects a response from a session that has signed out", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(config))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveRequest = resolve;
            }),
        )
        .mockResolvedValue(json({})),
    );
    const client = new ApiClient(vi.fn());
    await client.initialize();
    client.sessions.save({
      access_token: "old",
      refresh_token: "refresh",
      expires_in: 3600,
    });
    const result = client.api("/api/documents");
    await Promise.resolve();
    client.signOut();
    resolveRequest(json([{ id: "private-document" }]));
    await expect(result).rejects.toThrow("signed out");
  });
  it("verifies and removes recovery credentials before entering password recovery", async () => {
    history.replaceState(
      null,
      "",
      "/workspace#access_token=recovery-token&refresh_token=refresh&type=recovery",
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(config))
      .mockImplementationOnce(() => {
        expect(location.hash).toBe("");
        return Promise.resolve(json({ id: "owner" }));
      });
    vi.stubGlobal("fetch", fetcher);
    const client = new ApiClient(vi.fn());
    expect(await client.initialize()).toBe("recovery");
    expect(client.sessions.read()?.access_token).toBe("recovery-token");
    history.replaceState(null, "", "/");
  });
});
