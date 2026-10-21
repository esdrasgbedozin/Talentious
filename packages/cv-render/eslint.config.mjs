// Lint du package de rendu partagé (M0-T08c) — même socle de règles que le
// frontend qui le consomme (eslint-config-next : TS + React + hooks), pour que
// le code du package soit tenu au même standard que là où il s'exécute.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["node_modules/**"]),
  {
    rules: {
      // Le package n'est pas une app Next : pas de répertoire pages/.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
