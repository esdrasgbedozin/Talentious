/**
 * Invariant d'épinglage (ADR-PDF-RENDER, décision 3, revue T02 pt 4) :
 * le tag de l'image Playwright du stage runner et la version npm de
 * `playwright-core` sont la MÊME version exacte — le protocole CDP n'est
 * garanti qu'à versions identiques lib/Chromium. Ce test casse la CI si
 * l'un bouge sans l'autre (deux PR Dependabot séparées, édition manuelle…).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("invariant d'épinglage Playwright", () => {
  it("le tag du stage runner == la version exacte de playwright-core, avec digest", () => {
    const dockerfile = readFileSync(join(serviceRoot, "Dockerfile.prod"), "utf8");
    const fromRunner = dockerfile.match(
      /FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64} AS runner/,
    );
    expect(fromRunner, "stage runner introuvable ou non épinglé tag+digest").not.toBeNull();

    const pkg = JSON.parse(readFileSync(join(serviceRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    // Version EXACTE exigée (pas de ^ ni ~) et égale au tag de l'image.
    expect(pkg.dependencies["playwright-core"]).toBe(fromRunner![1]);
  });
});
