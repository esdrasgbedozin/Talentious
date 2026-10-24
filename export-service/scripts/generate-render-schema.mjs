/**
 * Génère l'artefact de validation runtime du payload /render/pdf
 * (`src/generated/render-payload.schema.json`) depuis le CONTRAT
 * `contracts/agents/export-service.openapi.yaml` (M2-T03, Contract First).
 *
 * - Déréférence tous les $ref (y compris inter-fichiers vers le contrat
 *   canonique `contracts/openapi.yaml`) : l'artefact est AUTOPORTANT.
 *   Résolution réseau interdite (`resolve.http: false`).
 * - Convertit le dialecte OpenAPI 3.0 vers du JSON Schema consommable par ajv
 *   (`nullable: true` → type [t, "null"], propagé dans `enum` le cas échéant)
 *   et retire les clés étrangères à la validation (example/examples/default —
 *   `useDefaults: false` côté ajv, un default dans l'artefact serait trompeur).
 * - Rend le schéma PLUS STRICT que le contrat (même principe
 *   qu'ADR-THEME-DECOUPLED) : à la frontière de RENDU, le contenu légitime
 *   sort de la coercition liste blanche du backend, donc tout laxisme est une
 *   anomalie, jamais une évolution :
 *     * tout objet à propriétés est FERMÉ (`additionalProperties: false`) ;
 *     * toute chaîne sans borne reçoit `maxLength` 10 000 (DEFAULT_STRING_MAX)
 *       (ex. `email`, `optimization_notes` dans le canonique).
 * - ÉCHOUE (exit 1) devant toute construction qui produirait un schéma
 *   laxiste ou un `instancePath` non sûr : combinateurs (allOf/oneOf/anyOf),
 *   patternProperties, nullable hors chaîne, objet sans properties, tableau
 *   sans maxItems… Les invariants sont revérifiés après coup sur l'artefact
 *   entier (et rejoués côté vitest : src/__tests__/schema-guard.test.ts).
 *
 * Lancé par `make generate-types` (cible generate-types-export-service) et
 * re-vérifié zéro-diff par la CI contracts-types. Ne jamais éditer la sortie.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let SwaggerParser;
try {
  ({ default: SwaggerParser } = await import("@apidevtools/swagger-parser"));
} catch {
  console.error(
    "Dépendance manquante (@apidevtools/swagger-parser) : lance d'abord `npm ci --workspace export-service`.",
  );
  process.exit(1);
}

const DEFAULT_STRING_MAX = 10_000;
const STRIPPED_KEYS = new Set([
  "example",
  "examples",
  "xml",
  "default",
  "nullable",
]);
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
];

function fail(message) {
  console.error(`Contrat refusé : ${message}`);
  process.exit(1);
}

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = join(
  serviceRoot,
  "..",
  "contracts",
  "agents",
  "export-service.openapi.yaml",
);
const outPath = join(
  serviceRoot,
  "src",
  "generated",
  "render-payload.schema.json",
);

const api = await SwaggerParser.dereference(contractPath, {
  resolve: { http: false },
});
const schema =
  api.paths?.["/render/pdf"]?.post?.requestBody?.content?.["application/json"]
    ?.schema;
if (!schema) {
  fail("schéma de requête /render/pdf introuvable");
}

/** OpenAPI 3.0 → JSON Schema : transformation récursive, détecte les cycles. */
function toJsonSchema(node, seen, path) {
  if (node === null || typeof node !== "object") return node;
  if (seen.has(node)) {
    fail(`${path} : cycle de $ref détecté — l'artefact doit rester un arbre`);
  }
  seen.add(node);
  if (Array.isArray(node)) {
    const out = node.map((item, i) =>
      toJsonSchema(item, seen, `${path}[${i}]`),
    );
    seen.delete(node);
    return out;
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRIPPED_KEYS.has(key)) continue;
    out[key] = toJsonSchema(value, seen, `${path}.${key}`);
  }
  if (node.nullable === true) {
    // Laxisme contrôlé : null n'est toléré QUE sur des chaînes. Un
    // `cv_content: null` ou `theme: null` valide serait un trou de rendu.
    if (out.type !== "string") {
      fail(
        `${path} : nullable n'est accepté que sur une chaîne (type=${JSON.stringify(out.type)})`,
      );
    }
    out.type = ["string", "null"];
    if (out.enum) out.enum = [...out.enum, null];
  }
  const types = Array.isArray(out.type) ? out.type : [out.type];
  if (
    types.includes("object") &&
    out.properties &&
    out.additionalProperties === undefined
  ) {
    out.additionalProperties = false;
  }
  if (types.includes("string") && out.maxLength === undefined) {
    out.maxLength = DEFAULT_STRING_MAX;
  }
  seen.delete(node);
  return out;
}

/** Invariants de sûreté, revérifiés sur l'artefact final (défense du script lui-même). */
function collectViolations(node, path, violations) {
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

const jsonSchema = {
  $id: "talentious://export-service/render-payload",
  ...toJsonSchema(schema, new Set(), "$"),
};

const violations = [];
collectViolations(jsonSchema, "$", violations);
if (violations.length > 0) {
  fail(
    `le schéma généré viole les invariants de sûreté :\n  - ${violations.join("\n  - ")}`,
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + "\n");
console.log(
  `render-payload.schema.json généré (${JSON.stringify(jsonSchema).length} octets)`,
);
