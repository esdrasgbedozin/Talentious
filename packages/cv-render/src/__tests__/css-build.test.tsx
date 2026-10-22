/**
 * M0-T14 — Build CSS du package (Tailwind v4 CLI), injectable HORS Next.
 *
 * L'export-service (M2-T04) compose son HTML avec `setContent` : il a besoin
 * d'un CSS autonome couvrant les classes utilitaires du renderer, sans dépendre
 * du pipeline Next. Critères du ticket :
 * - le CSS généré contient TOUTES les classes réellement posées par le rendu
 *   des 3 fixtures canoniques, pour CHAQUE template du registre ;
 * - AUCUNE règle `:root` : les variables du moteur Tailwind sont re-scopées
 *   sur `.cv-sheet`. Le preflight (resets `*`, `html`…) reste global, sous
 *   @layer : l'artefact est réservé à un document DÉDIÉ que le package possède
 *   (setContent) — jamais injecté dans un hôte quelconque.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { getTemplate, TEMPLATE_IDS } from '../templates/registry';
import type { GeneratedCVData } from '../types';
import completeJson from '../../../../fixtures/cv-reference/complete.json';
import minimalJson from '../../../../fixtures/cv-reference/minimal.json';
import denseJson from '../../../../fixtures/cv-reference/dense.json';

const PKG_ROOT = path.resolve(__dirname, '../..');
const CSS_PATH = path.join(PKG_ROOT, 'dist', 'cv.css');

const fixtures = [completeJson, minimalJson, denseJson] as unknown as GeneratedCVData[];

/** Échappement CSS d'un nom de classe utilitaire (`mb-1.5` → `.mb-1\.5`,
 * `text-[10px]` → `.text-\[10px\]`). */
function cssSelector(cls: string): string {
  return `.${cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)}`;
}

/** Présence BORNÉE du sélecteur : `.p-1` ne doit pas être « trouvé » dans
 * `.p-10` ni `.p-1\.5` (faux positif relevé en revue T14+T15) — le caractère
 * suivant ne peut pas prolonger un nom de classe échappé. */
function hasSelector(css: string, cls: string): boolean {
  const escaped = cssSelector(cls).replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
  return new RegExp(`${escaped}(?![\\w\\\\-])`).test(css);
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('build CSS du package (M0-T14)', () => {
  let css: string;

  beforeAll(() => {
    // Le build DOIT être reproductible depuis le package seul. Timeout large :
    // process CLI Tailwind complet, lent sur une CI froide (revue T14+T15).
    execFileSync('node', ['scripts/build-css.mjs'], { cwd: PKG_ROOT, stdio: 'pipe' });
    css = readFileSync(CSS_PATH, 'utf8');
  }, 60_000);

  it('contient le sélecteur de CHAQUE classe posée par chaque template sur les 3 fixtures', () => {
    expect(TEMPLATE_IDS.length).toBeGreaterThan(0);
    const used = new Set<string>();
    for (const templateId of TEMPLATE_IDS) {
      const Template = getTemplate(templateId);
      for (const cv of fixtures) {
        const { container } = render(<Template cv={cv} />);
        for (const el of container.querySelectorAll('[class]')) {
          for (const cls of Array.from(el.classList)) used.add(cls);
        }
      }
    }
    // Contrôle positif : le rendu pose bien des utilitaires non triviaux.
    expect(used.size).toBeGreaterThan(10);
    expect(used.has('cv-sheet')).toBe(true);
    used.delete('cv-sheet'); // classe d'ancrage sémantique, pas un utilitaire Tailwind

    const missing = [...used].filter((cls) => !hasSelector(css, cls));
    expect(missing).toEqual([]);
  });

  it('le détecteur de classes manquantes a des dents (contrôles positif/négatif)', () => {
    // Une classe fantaisiste DOIT être détectée absente…
    expect(hasSelector(css, 'zz-classe-absente')).toBe(false);
    // …et un préfixe ne doit pas matcher un sélecteur plus long : `.mb-1` ne
    // compte pas si seul `.mb-1.5` (échappé `.mb-1\.5`) existe.
    expect(hasSelector('.mb-1\\.5{margin-bottom:6px}', 'mb-1')).toBe(false);
    expect(hasSelector('.mb-10{margin-bottom:40px}', 'mb-1')).toBe(false);
    expect(hasSelector('.mb-1{margin-bottom:4px}', 'mb-1')).toBe(true);
  });

  it('aucune règle :root — variables moteur re-scopées sur .cv-sheet', () => {
    expect(css).not.toMatch(/:root/);
    expect(css).toContain('.cv-sheet');
  });

  it("n'embarque aucune classe de la charte app (le package reste découplé du thème)", () => {
    // Mêmes interdits que les sentinelles T09 : si l'une réapparaissait dans
    // les SOURCES DE RENDU, elle serait compilée ici — double verrou côté
    // artefact. (Les fichiers de test — dont celui-ci — sont exclus du scan
    // par `@source not`, sinon ces chaînes seraient elles-mêmes scannées.)
    for (const forbidden of ['text-action', 'bg-action', 'text-text-primary']) {
      expect(hasSelector(css, forbidden)).toBe(false);
    }
  });
});
