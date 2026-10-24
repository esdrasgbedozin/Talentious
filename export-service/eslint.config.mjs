// Lint du service d'export (M2-T01) — service Node pur, sans React : socle
// typescript-eslint recommandé (le socle Next de cv-render/frontend ne
// s'applique pas ici), même exigence de sévérité que le reste du monorepo.
import { defineConfig, globalIgnores } from "eslint/config";
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  // Scripts d'outillage (.mjs, M2-T03/T04) : exécutés par Node hors tsc.
  // Globals déclarés À LA MAIN (revue T04) : le paquet `globals` n'est une
  // dépendance déclarée nulle part dans le monorepo — ne pas dépendre du hoisting.
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
  },
  globalIgnores(["node_modules/**", "dist/**"]),
]);

export default eslintConfig;
