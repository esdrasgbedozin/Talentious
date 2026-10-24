/**
 * M2-T04 — garantit l'artefact CSS du package (packages/cv-render/dist/cv.css,
 * non versionné) AVANT la suite : la route /render/pdf construit désormais le
 * document (SSR + CSS embarqué), les tests d'app en dépendent donc tous.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export default function setup(): void {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const cssPath = join(repoRoot, "packages", "cv-render", "dist", "cv.css");
  if (!existsSync(cssPath)) {
    execSync("npm run build:css --workspace @talentious/cv-render", {
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 120_000,
    });
  }
}
