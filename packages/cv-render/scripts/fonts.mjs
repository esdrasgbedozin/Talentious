/**
 * Polices embarquées (M0-T16) : copie les woff2 OFL des packages @fontsource
 * (épinglés exacts — provenance versionnée + intégrité sha512 du lockfile,
 * jamais de binaires vendorés en git) vers dist/fonts/, et génère les
 * @font-face LOCAUX correspondants (aucune requête externe — critère T16).
 *
 * - Manifeste `fonts.manifest.json` : DOIT couvrir exactement la liste blanche
 *   du contrat (`CVFontFamily` / CV_FONT_FAMILIES) — testé dans css-build.test.
 * - Sous-ensemble `latin` seul : couvre intégralement FR/EN (œ compris) ; un
 *   glyphe hors latin retombe sur la pile de secours (sans-serif/serif).
 * - `font-display: block` : l'export attend les polices (fonts.ready, M0-T15),
 *   jamais de rendu PDF avec une police de substitution.
 * - Les LICENSE OFL de chaque fonderie sont copiées à côté des fichiers.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const manifest = JSON.parse(readFileSync(path.join(here, 'fonts.manifest.json'), 'utf8'));

// Validation stricte du manifeste AVANT toute interpolation (revue sécurité
// T16) : les valeurs finissent dans des chemins (copyFileSync, require.resolve)
// et dans le CSS généré — un manifeste corrompu doit casser le build, jamais
// produire une traversée de répertoires ou une injection CSS.
const FAMILY_RE = /^[A-Za-z0-9 ]+$/;
const SLUG_RE = /^[a-z0-9-]+$/;
for (const [family, spec] of Object.entries(manifest)) {
  if (!FAMILY_RE.test(family)) {
    throw new Error(`fonts: nom de famille invalide dans le manifeste : ${JSON.stringify(family)}`);
  }
  if (!SLUG_RE.test(spec.slug)) {
    throw new Error(`fonts: slug invalide pour ${family} : ${JSON.stringify(spec.slug)}`);
  }
  for (const w of [...spec.weights, ...spec.italicWeights]) {
    if (!Number.isInteger(w) || w < 100 || w > 900) {
      throw new Error(`fonts: graisse invalide pour ${family} : ${JSON.stringify(w)}`);
    }
  }
}

/** Variantes d'une famille : [poids, style, nom de fichier @fontsource]. */
function variants(spec) {
  return [
    ...spec.weights.map((w) => [w, 'normal', `${spec.slug}-latin-${w}-normal.woff2`]),
    ...spec.italicWeights.map((w) => [w, 'italic', `${spec.slug}-latin-${w}-italic.woff2`]),
  ];
}

/**
 * Copie les woff2 (+ LICENSE) du manifeste vers `${outDir}/fonts/` et renvoie
 * le bloc CSS des @font-face, avec des `url('fonts/…')` RELATIFS à l'artefact.
 * Échoue bruyamment si un fichier attendu manque chez @fontsource (une montée
 * de version qui retire une graisse doit casser le build, pas l'export).
 */
export function buildFontFaces(outDir) {
  // CONTRAT : `fonts/` doit rester le dossier VOISIN de cv.css (les url()
  // générées sont `fonts/…`, relatives à l'artefact).
  const fontsDir = path.join(outDir, 'fonts');
  // Nettoyage avant copie : jamais de woff2 fantôme d'un build précédent dans
  // l'artefact (revue T16) — le test « allowlist == fichiers présents » doit
  // refléter le manifeste, pas l'état du disque.
  rmSync(fontsDir, { recursive: true, force: true });
  mkdirSync(fontsDir, { recursive: true });

  const rules = [];
  for (const [family, spec] of Object.entries(manifest)) {
    // Racine du package @fontsource, résolue via son manifest npm (pas de PATH).
    const pkgDir = path.dirname(require.resolve(`@fontsource/${spec.slug}/package.json`));
    copyFileSync(path.join(pkgDir, 'LICENSE'), path.join(fontsDir, `LICENSE-${spec.slug}.txt`));
    for (const [weight, style, file] of variants(spec)) {
      copyFileSync(path.join(pkgDir, 'files', file), path.join(fontsDir, file));
      rules.push(
        '@font-face {\n' +
          `  font-family: '${family}';\n` +
          `  font-style: ${style};\n` +
          `  font-weight: ${weight};\n` +
          '  font-display: block;\n' +
          `  src: url('fonts/${file}') format('woff2');\n` +
          '}',
      );
    }
  }
  return `/* Polices curatées OFL embarquées (M0-T16) — aucune requête externe. */\n${rules.join('\n')}\n`;
}
