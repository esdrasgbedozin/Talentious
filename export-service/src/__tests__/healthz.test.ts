import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

describe("GET /healthz", () => {
  it("répond 200 avec le statut du service, sans toucher au réseau", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("ne expose rien d'autre à la racine", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
