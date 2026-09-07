import { onRequest } from "../../functions/assets/[[path]]";

describe("Cloudflare asset guard", () => {
  it.each([200, 404])("turns an HTML asset fallback with status %s into a non-cacheable 404", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response("<!doctype html>", {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }));

    const response = await onRequest({
      request: new Request("https://armatureailabs.com/assets/missing.js"),
      env: { ASSETS: { fetch } }
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("Asset not found.");
  });

  it("passes a real static asset response through unchanged", async () => {
    const asset = new Response("export const ready = true", {
      status: 200,
      headers: { "Content-Type": "application/javascript" }
    });

    const response = await onRequest({
      request: new Request("https://armatureailabs.com/assets/index-hash.js"),
      env: { ASSETS: { fetch: vi.fn().mockResolvedValue(asset) } }
    });

    expect(response).toBe(asset);
  });
});
