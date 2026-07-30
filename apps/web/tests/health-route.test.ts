import { describe, expect, it } from "vitest";

import { GET, HEAD } from "../app/api/health/route";

describe("receiver health route", () => {
  it.each([GET, HEAD])("returns a cheap uncached 204 response", (handler) => {
    const response = handler();

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });
});
