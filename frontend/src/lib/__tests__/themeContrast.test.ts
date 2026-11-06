/**
 * M3-T10 — parité du contraste client/serveur par FIXTURES PARTAGÉES.
 * fixtures/theme-validation/cases.json est la source commune au serveur
 * (theme_validation.py, M1-T09) et à l'éditeur. Pour chaque cas dont les 4
 * couleurs sont des #RRGGBB valides et dont les erreurs éventuelles sont toutes
 * des couleurs de premier plan (dimension CONTRASTE pure), le verdict client
 * doit être identique à celui du serveur. Le serveur n'est pas exécuté ici :
 * il valide le MÊME fichier dans test_theme_validation.py, c'est le fichier
 * partagé qui scelle la parité.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateThemeContrast, CONTRAST_FIELDS } from '@/lib/themeContrast';
import type { components } from '@/generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

interface FixtureCase {
  name: string;
  valid: boolean;
  tokens: Record<string, unknown>;
  error_fields?: string[];
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FG: string[] = [...CONTRAST_FIELDS];
const COLOR_KEYS = [
  'color_text',
  'color_muted',
  'color_accent',
  'color_background',
];

// process.cwd() = dossier frontend au lancement de jest ; la racine du repo est
// un cran au-dessus. Robuste au déplacement du fichier de test.
const FIXTURE = resolve(
  process.cwd(),
  '..',
  'fixtures/theme-validation/cases.json',
);
if (!existsSync(FIXTURE)) {
  throw new Error(`Fixtures de thème introuvables : ${FIXTURE}`);
}

const fixtures = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as {
  cases: FixtureCase[];
};

// On isole la dimension CONTRASTE : 4 couleurs #RRGGBB valides (ratio calculable)
// et erreurs toutes de premier plan (exclut format hex, police, structure).
const contrastCases = fixtures.cases.filter(
  (c) =>
    COLOR_KEYS.every(
      (k) => typeof c.tokens[k] === 'string' && HEX.test(c.tokens[k] as string),
    ) && (c.valid || (c.error_fields ?? []).every((f) => FG.includes(f))),
);

describe('themeContrast — parité client/serveur (M3-T10, fixtures partagées)', () => {
  it('couvre les deux classes de contraste des fixtures (valide ET illisible)', () => {
    expect(contrastCases.length).toBeGreaterThanOrEqual(6);
    // Un filtre qui viderait une des deux classes passerait inaperçu sans ça.
    expect(contrastCases.some((c) => c.valid)).toBe(true);
    expect(contrastCases.some((c) => !c.valid)).toBe(true);
  });

  it.each(contrastCases.map((c) => [c.name, c] as const))(
    'même verdict que le serveur pour %s',
    (_name, c) => {
      const clientFailing = evaluateThemeContrast(c.tokens as CVThemeTokens)
        .filter((r) => !r.readable)
        .map((r) => r.field)
        .sort();
      // Côté serveur : les champs en erreur (ici tous de premier plan) ; vide
      // pour un cas valide, ce qui impose « aucun illisible » côté client.
      const serverFailing = (c.error_fields ?? [])
        .filter((f) => FG.includes(f))
        .sort();
      expect(clientFailing).toEqual(serverFailing);
    },
  );
});
