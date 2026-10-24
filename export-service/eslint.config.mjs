// Lint du service d'export (M2-T01) — service Node pur, sans React : socle
// typescript-eslint recommandé (le socle Next de cv-render/frontend ne
// s'applique pas ici), même exigence de sévérité que le reste du monorepo.
import { defineConfig, globalIgnores } from "eslint/config";
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores(["node_modules/**", "dist/**"]),
]);

export default eslintConfig;
