/**
 * M2-T09 — politique sandbox Chromium (ADR-RENDER-SECURITY) :
 * `--no-sandbox` n'est JAMAIS accepté sans ses compensations — la première
 * étant vérifiable au démarrage : ne JAMAIS tourner root (uid 0). Les autres
 * (egress avorté T08, Option B sans navigation, FS applicatif root-owned,
 * écritures /tmp seul) sont des propriétés de l'image et du code, prouvées
 * par leurs propres tests et par le run conteneur --read-only.
 */
import { describe, expect, it } from "vitest";

import { validateChromiumLaunch } from "../render/pdf.js";

describe("validateChromiumLaunch — politique sandbox (M2-T09)", () => {
  it("--no-sandbox sous ROOT ⇒ refus (compensation non-root absente)", () => {
    expect(() => validateChromiumLaunch(["--no-sandbox"], 0)).toThrow(/root/i);
  });

  it("--no-sandbox sous uid non-root ⇒ accepté (compensations réunies)", () => {
    expect(() => validateChromiumLaunch(["--no-sandbox"], 1001)).not.toThrow();
  });

  it("sans --no-sandbox : accepté quel que soit l'uid (sandbox Chromium actif)", () => {
    expect(() =>
      validateChromiumLaunch(["--disable-dev-shm-usage"], 0),
    ).not.toThrow();
    expect(() => validateChromiumLaunch([], 1001)).not.toThrow();
  });

  it("uid INDÉFINI (dev Windows) : fail-open ASSUMÉ — la prod est un conteneur Linux", () => {
    expect(() =>
      validateChromiumLaunch(["--no-sandbox"], undefined),
    ).not.toThrow();
  });

  it("un argument hors liste blanche reste refusé (revue T06)", () => {
    expect(() =>
      validateChromiumLaunch(["--disable-web-security"], 1001),
    ).toThrow(/liste blanche/i);
  });
});
