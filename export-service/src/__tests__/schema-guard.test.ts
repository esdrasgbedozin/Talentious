/**
 * M2-T03 (revue sécurité) — garde sur l'ARTEFACT généré render-payload.schema.json.
 *
 * Rejoue les invariants de sûreté que le générateur impose (scripts/
 * generate-render-schema.mjs) : si une régression du script ou une évolution
 * du contrat canonique produit un schéma plus laxiste, ce test casse AVANT
 * qu'un payload hostile n'atteigne le rendu. Protège tous les chemins sans
 * devoir tester chaque champ un à un.
 */
import { describe, expect, it } from "vitest";

import schema from "../generated/render-payload.schema.json" with { type: "json" };

interface SchemaNode {
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  additionalProperties?: unknown;
  maxLength?: unknown;
  maxItems?: unknown;
  [key: string]: unknown;
}

/** Mots-clés qui rouvriraient le schéma ou rendraient instancePath non sûr. */
const FORBIDDEN_KEYWORDS = [
  "allOf",
  "oneOf",
  "anyOf",
  "not",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "patternProperties",
  "propertyNames",
  "$ref",
  "default",
  "example",
  "examples",
];

function collectViolations(
  node: SchemaNode,
  path: string,
  violations: string[],
): void {
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (keyword in node)
      violations.push(`${path} : mot-clé interdit « ${keyword} »`);
  }
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (node.type === undefined) violations.push(`${path} : type manquant`);
  if (types.includes("object")) {
    if (node.additionalProperties !== false)
      violations.push(`${path} : objet non fermé`);
    if (!node.properties) violations.push(`${path} : objet sans properties`);
  }
  if (types.includes("string") && typeof node.maxLength !== "number") {
    violations.push(`${path} : chaîne sans maxLength`);
  }
  if (types.includes("array")) {
    if (typeof node.maxItems !== "number")
      violations.push(`${path} : tableau sans maxItems`);
    if (!node.items) violations.push(`${path} : tableau sans items`);
  }
  if (node.items) collectViolations(node.items, `${path}.items`, violations);
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    collectViolations(child, `${path}.${name}`, violations);
  }
}

describe("render-payload.schema.json — invariants de sûreté", () => {
  it("tout objet est fermé, toute chaîne bornée, tout tableau borné, aucun mot-clé laxiste", () => {
    const violations: string[] = [];
    collectViolations(schema as SchemaNode, "$", violations);
    expect(violations).toEqual([]);
  });

  it('nullable traduit en type [t, "null"] uniquement sur des chaînes', () => {
    const violations: string[] = [];
    (function walk(node: SchemaNode, path: string): void {
      if (
        Array.isArray(node.type) &&
        node.type.includes("null") &&
        !node.type.includes("string")
      ) {
        violations.push(`${path} : null autorisé sur un type non-chaîne`);
      }
      if (node.items) walk(node.items, `${path}.items`);
      for (const [name, child] of Object.entries(node.properties ?? {})) {
        walk(child, `${path}.${name}`);
      }
    })(schema as SchemaNode, "$");
    expect(violations).toEqual([]);
  });
});
