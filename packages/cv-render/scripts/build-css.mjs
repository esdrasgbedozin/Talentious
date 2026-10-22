/**
 * Build CSS du package (M0-T14) : Tailwind v4 CLI → dist/cv.css, puis
 * re-scope des variables moteur `:root, :host` → `.cv-sheet, :host`.
 *
 * Pourquoi le re-scope : l'artefact est injecté dans un document que le
 * package ne possède pas (export-service M2, voire tout hôte futur). Aucune
 * règle `:root` globale ne doit en sortir (critère M0-T14) — les variables ne
 * vivent que sous la racine `.cv-sheet`, comme les `--cv-*` du thème
 * (ADR-THEME-DECOUPLED).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(pkgRoot, 'src/styles/cv.css');
const outDir = path.join(pkgRoot, 'dist');
const output = path.join(outDir, 'cv.css');

mkdirSync(outDir, { recursive: true });
execFileSync('npx', ['--no-install', '@tailwindcss/cli', '-i', input, '-o', output], {
  cwd: pkgRoot,
  stdio: 'inherit',
});

// Re-scope CIBLÉ sur la forme exacte émise par Tailwind (`:root, :host`) —
// jamais un remplacement aveugle de `:root` (qui altérerait un futur
// `:where(:root)`, un commentaire, une valeur…). Si `:root` apparaît sous une
// autre forme, on échoue : un changement d'émission de Tailwind doit casser le
// build ici, pas produire un CSS altéré en silence.
const TAILWIND_ROOT_SELECTOR = ':root, :host';
const built = readFileSync(output, 'utf8');
const occurrences = built.split(TAILWIND_ROOT_SELECTOR).length - 1;
if (occurrences === 0) {
  throw new Error(
    `build-css: aucune émission \`${TAILWIND_ROOT_SELECTOR}\` trouvée — la forme d'émission de Tailwind a changé, re-vérifier le re-scope.`,
  );
}
const rescoped = built.replaceAll(TAILWIND_ROOT_SELECTOR, '.cv-sheet, :host');
if (rescoped.includes(':root')) {
  throw new Error(
    'build-css: `:root` présent hors de la forme attendue `:root, :host` — re-scope à adapter avant de livrer.',
  );
}
writeFileSync(output, rescoped);
console.log(`build-css: ${path.relative(pkgRoot, output)} généré (${occurrences} émission(s) \`${TAILWIND_ROOT_SELECTOR}\` re-scopée(s) sur .cv-sheet).`);
