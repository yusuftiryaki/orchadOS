import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function call(z: string, x: string, y: string, headers: Record<string, string> = {}) {
  const request = new Request(`https://orchados.example/harita/karo/${z}/${x}/${y}`, { headers });
  return GET(request, { params: Promise.resolve({ z, x, y }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("tile proxy route", () => {
  it("fetches the tile without anything of the visitor and lets the CDN cache it", async () => {
    const fetchMock = vi.fn(
      async () => new Response(PNG, { headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await call("3", "4", "5.png", {
      cookie: "sb-access-token=secret",
      "x-forwarded-for": "198.51.100.7",
      "user-agent": "Visitor Browser",
      referer: "https://orchados.example/portal",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/public, max-age=604800, s-maxage=2592000/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://tile.openstreetmap.org/3/4/5.png");
    const sent = new Headers(init.headers);
    expect([...sent.keys()].sort()).toEqual(["accept", "user-agent"]);
    expect(sent.get("user-agent")).toMatch(/^orchadOS-tile-proxy\//);
    expect(JSON.stringify(init)).not.toMatch(/198\.51\.100\.7|secret|Visitor Browser|portal/);
  });

  it("uses the configured upstream", async () => {
    vi.stubEnv("MAP_TILE_UPSTREAM", "https://tiles.orchados.example/osm/{z}/{x}/{y}.png");
    const fetchMock = vi.fn(
      async () => new Response(PNG, { headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect((await call("1", "1", "0.png")).status).toBe(200);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://tiles.orchados.example/osm/1/1/0.png",
    );
  });

  it("refuses bad coordinates without asking the upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call("25", "0", "0.png")).status).toBe(404);
    expect((await call("1", "0", "0.svg")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cache upstream failures or non-images", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })),
    );
    const html = await call("2", "1", "1.png");
    expect(html.status).toBe(502);
    expect(html.headers.get("cache-control")).toBe("no-store");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect((await call("2", "1", "1.png")).status).toBe(502);
  });

  it("limits one client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(PNG, { headers: { "content-type": "image/png" } })),
    );
    const statuses = new Set<number>();
    for (let i = 0; i < 601; i++) {
      statuses.add((await call("0", "0", "0.png", { "x-forwarded-for": "203.0.113.99" })).status);
    }
    expect(statuses).toEqual(new Set([200, 429]));
    expect((await call("0", "0", "0.png", { "x-forwarded-for": "203.0.113.98" })).status).toBe(200);
  });
});
