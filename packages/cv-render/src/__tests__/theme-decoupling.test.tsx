/**
 * M0-T09 — TESTS ROUGES de découplage du thème (ADR-THEME-DECOUPLED).
 *
 * Écrits ROUGES en M0-T09 (`it.failing`, échec prouvé sur le couplage : 8 tokens
 * de charte dans CVRenderer.tsx + aucun `var(--cv-accent)` au rendu), basculés
 * en `it` par la migration M0-T10 : ils sont depuis le GARDE-FOU PERMANENT du
 * découplage — le package ne lit que les variables CV-scopées `--cv-*`, jamais
 * les tokens globaux de l'app.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';
import CVRenderer from '../CVRenderer';
import { themeToCssVars } from '../theme';
import type { GeneratedCVData } from '../types';
import completeFixture from '../../../../fixtures/cv-reference/complete.json';

const complete = completeFixture as unknown as GeneratedCVData;

beforeAll(() => {
  // CVRenderer instancie un ResizeObserver (absent de jsdom) : sans ce stub le
  // test (b) échouerait sur un crash de rendu — un rouge PARASITE — au lieu
  // d'échouer sur le couplage qu'il doit prouver (revue T09).
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

/** Tokens globaux de l'app Talentious : INTERDITS dans le package (le rendu
 * doit suivre le thème CV snapshoté, pas la charte de l'interface). */
const FORBIDDEN_APP_TOKENS = [
  'text-action',
  'bg-action',
  'border-border',
  'text-border',
  'text-text-primary',
  'text-text-secondary',
  'text-primary',
  'bg-white',
];

/** Sources du package, RÉCURSIF (hors tests et types générés) : le garde-fou
 * doit voir les sous-dossiers à venir (`templates/`, T11/T12 — revue T09). */
const EXCLUDED_DIRS = new Set(['generated', '__tests__', 'node_modules']);

function packageSources(dir = join(__dirname, '..')): Array<{ file: string; content: string }> {
  const out: Array<{ file: string; content: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...packageSources(path));
    } else if (/\.(ts|tsx|css)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push({ file: path, content: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

describe('découplage du thème — garde-fou permanent (rouge T09 → vert T10)', () => {
  it.failing('aucun token global de l\'app dans les sources du package (grep)', () => {
    const sources = packageSources();
    // Contrôle positif (revue T09) : un scan aveugle (répertoire vide ou filtre
    // cassé) passerait en silence — on exige qu'il voie réellement des sources.
    expect(sources.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const { file, content } of sources) {
      for (const token of FORBIDDEN_APP_TOKENS) {
        if (content.includes(token)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.failing('le rendu suit le thème CV : les titres de section portent var(--cv-accent) et aucune classe interdite ne fuit dans le balisage', () => {
    const { container } = render(
      <div style={themeToCssVars(null) as React.CSSProperties}>
        <CVRenderer cv={complete} />
      </div>,
    );
    // La couleur d'accent vient du thème snapshoté, pas de la charte de l'app.
    const titles = Array.from(container.querySelectorAll('h2'));
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title.getAttribute('style') ?? '').toContain('var(--cv-accent');
    }
    // Et aucune classe app-globale ne subsiste dans le balisage rendu.
    const html = container.innerHTML;
    for (const token of FORBIDDEN_APP_TOKENS) {
      expect(html).not.toContain(token);
    }
  });
});
