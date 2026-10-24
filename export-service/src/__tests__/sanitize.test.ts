/**
 * M2-T04 — normalisation du contenu avant rendu (revue sécu T03 point d,
 * plages étendues en revue T04). Les caractères hostiles sont écrits en
 * échappements \u : aucun caractère bidi littéral dans ce fichier (Trojan
 * Source).
 */
import { describe, expect, it } from "vitest";

import { sanitizeForRender } from "../render/sanitize.js";

describe("sanitizeForRender — contrôles", () => {
  it("retire NUL et les contrôles C0/C1 (bornes comprises), conserve \\n et \\t", () => {
    expect(sanitizeForRender("A\u0000B\u0007C\u009FD")).toBe("ABCD");
    expect(sanitizeForRender("a\u0008b\u000Bc\u000Ed")).toBe("abcd");
    expect(sanitizeForRender("x\u007Fy\u0085z")).toBe("xyz");
    expect(sanitizeForRender("ligne1\nligne2\tfin")).toBe(
      "ligne1\nligne2\tfin",
    );
    expect(sanitizeForRender("\t seul \n")).toBe("\t seul \n");
  });

  it("normalise \\r\\n, \\r, U+2028 et U+2029 en \\n", () => {
    expect(sanitizeForRender("a\r\nb\rc\u2028d\u2029e")).toBe("a\nb\nc\nd\ne");
  });
});

describe("sanitizeForRender — bidi et invisibles", () => {
  it("retire overrides/isolats bidi (U+202A–E, U+2066–69)", () => {
    expect(sanitizeForRender("cv\u202Efdp.exe")).toBe("cvfdp.exe");
    expect(sanitizeForRender("\u2066abc\u2069")).toBe("abc");
    expect(sanitizeForRender("\u202Ax\u202B\u202C\u202D")).toBe("x");
  });

  it("retire les marques directionnelles U+200E, U+200F, U+061C", () => {
    expect(sanitizeForRender("a\u200Eb\u200Fc\u061Cd")).toBe("abcd");
  });

  it("retire les largeur-nulle (ZWSP, WJ, BOM, soft hyphen, U+180E) mais GARDE ZWJ/ZWNJ", () => {
    expect(sanitizeForRender("m\u200Bo\u2060t\uFEFFs\u00ADx\u180E")).toBe(
      "motsx",
    );
    expect(sanitizeForRender("👩\u200D💻 et fa\u200Crsi")).toBe(
      "👩\u200D💻 et fa\u200Crsi",
    );
  });

  it("retire les caractères Tag (ASCII smuggling) et sélecteurs de variation hors BMP", () => {
    expect(sanitizeForRender("plan\u{E0041}\u{E0049}visible")).toBe(
      "planvisible",
    );
    expect(sanitizeForRender("a\u{E0100}b")).toBe("ab");
  });

  it("retire les non-caractères et répare les surrogates isolés", () => {
    expect(sanitizeForRender("a\uFDD0b\uFFFEc\uFFFFd")).toBe("abcd");
    const lone = "x" + "\uD800" + "y"; // surrogate haut isolé
    expect(sanitizeForRender(lone)).toBe("x\uFFFDy");
  });
});

describe("sanitizeForRender — structure", () => {
  it("traverse objets, tableaux et null sans toucher aux autres types", () => {
    const input = {
      summary: "ok\u202E!",
      phone: null,
      nested: [{ name: "x\u0000y" }, 42, true],
    };
    expect(sanitizeForRender(input)).toEqual({
      summary: "ok!",
      phone: null,
      nested: [{ name: "xy" }, 42, true],
    });
  });

  it("ne mute pas l'entrée", () => {
    const input = { s: "a\u0000b" };
    sanitizeForRender(input);
    expect(input.s).toBe("a\u0000b");
  });

  it("une clé __proto__ reste une donnée (jamais le prototype)", () => {
    const input = JSON.parse(
      '{"__proto__": {"pollue": true}, "ok": "v"}',
    ) as Record<string, unknown>;
    const out = sanitizeForRender(input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { pollue?: unknown }).pollue).toBeUndefined();
    expect(Object.getOwnPropertyNames(out)).toContain("__proto__");
  });
});
