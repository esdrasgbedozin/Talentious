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
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { getTemplate, TEMPLATE_IDS } from '../templates/registry';
import { CV_FONT_FAMILIES } from '../theme';
import fontManifest from '../../scripts/fonts.manifest.json';
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

  /**
   * M0-T16 — Polices curatées OFL embarquées. Critères du ticket :
   * allowlist == fichiers présents (dans les DEUX sens) ; aucune requête
   * externe dans le CSS. Les @font-face sont générés depuis
   * scripts/fonts.manifest.json (source : packages @fontsource épinglés).
   */
  describe('polices embarquées OFL (M0-T16)', () => {
    const FONTS_DIR = path.join(PKG_ROOT, 'dist', 'fonts');

    type FontSpec = { slug: string; weights: number[]; italicWeights: number[] };
    const manifest = fontManifest as Record<string, FontSpec>;

    function variantFiles(spec: FontSpec): string[] {
      return [
        ...spec.weights.map((w) => `${spec.slug}-latin-${w}-normal.woff2`),
        ...spec.italicWeights.map((w) => `${spec.slug}-latin-${w}-italic.woff2`),
      ];
    }

    it('le manifeste couvre EXACTEMENT la liste blanche du contrat (CVFontFamily)', () => {
      expect(Object.keys(manifest).sort()).toEqual([...CV_FONT_FAMILIES].sort());
    });

    it('une @font-face locale par famille et par variante, chaque fichier woff2 présent', () => {
      // EXACTEMENT une règle par variante du manifeste — une @font-face
      // surnuméraire (famille hors liste blanche…) est un constat (revue T16).
      const totalVariants = Object.values(manifest).reduce(
        (n, spec) => n + spec.weights.length + spec.italicWeights.length,
        0,
      );
      expect([...css.matchAll(/@font-face/g)]).toHaveLength(totalVariants);
      for (const [family, spec] of Object.entries(manifest)) {
        // Graisses utilisées par le renderer : 400, 600 et 700 partout (le
        // manifeste les impose ; le build échoue si une fonderie les retire).
        expect(spec.weights).toEqual(expect.arrayContaining([400, 600, 700]));
        expect(spec.italicWeights).toEqual(expect.arrayContaining([400]));
        for (const file of variantFiles(spec)) {
          const isItalic = file.endsWith('-italic.woff2');
          const weight = Number(/-(\d+)-(?:normal|italic)\.woff2$/.exec(file)![1]);
          const facePattern = new RegExp(
            `@font-face\\s*\\{[^}]*font-family:\\s*'${family}';[^}]*` +
              `font-style:\\s*${isItalic ? 'italic' : 'normal'};[^}]*` +
              `font-weight:\\s*${weight};[^}]*` +
              `src:\\s*url\\('fonts/${file}'\\)\\s*format\\('woff2'\\)`,
          );
          expect(css).toMatch(facePattern);
          expect(existsSync(path.join(FONTS_DIR, file))).toBe(true);
          // Fichier réel, pas un artefact vide/tronqué : signature WOFF2.
          const bytes = readFileSync(path.join(FONTS_DIR, file));
          expect(bytes.length).toBeGreaterThan(1000);
          expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
        }
      }
    });

    it('fichiers présents == allowlist : dist/fonts ne contient RIEN d’autre', () => {
      const expected = new Set(
        Object.values(manifest).flatMap((spec) => variantFiles(spec)),
      );
      const actual = readdirSync(FONTS_DIR).filter((f) => f.endsWith('.woff2'));
      expect([...actual].sort()).toEqual([...expected].sort());
      // Seuls les woff2 attendus et les licences OFL ont le droit d'exister :
      // exactement UNE licence par fonderie (obligation de redistribution OFL).
      const others = readdirSync(FONTS_DIR).filter((f) => !f.endsWith('.woff2'));
      const expectedLicenses = Object.values(manifest).map((s) => `LICENSE-${s.slug}.txt`);
      expect([...others].sort()).toEqual([...expectedLicenses].sort());
    });

    it('aucune requête externe : toutes les url() du CSS sont relatives vers fonts/*.woff2', () => {
      const urls = [...css.matchAll(/url\(\s*([^)]+?)\s*\)/g)].map((m) =>
        m[1].replace(/^['"]|['"]$/g, ''),
      );
      expect(urls.length).toBeGreaterThan(0); // contrôle positif : les @font-face sont bien là
      for (const u of urls) {
        expect(u).toMatch(/^fonts\/[A-Za-z0-9-]+\.woff2$/);
      }
      // Hors commentaires (la bannière Tailwind contient une URL inoffensive),
      // aucun autre vecteur de chargement : pas d'@import, pas d'image-set(),
      // pas de local() (dépendance non déterministe aux polices système), pas
      // de schéma http(s), pas d'@namespace.
      const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(noComments).not.toMatch(/@import|@namespace|image-set\(|local\(|https?:/i);
      // Toute source de police est EXACTEMENT un url('fonts/…') format('woff2').
      const srcs = [...noComments.matchAll(/src:\s*([^;}]+)/g)].map((m) => m[1].trim());
      expect(srcs.length).toBeGreaterThan(0);
      for (const s of srcs) {
        expect(s).toMatch(/^url\('fonts\/[a-z0-9-]+\.woff2'\) format\('woff2'\)$/);
      }
    });
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
