/**
 * M2-T04 — assemblage du DOCUMENT HTML complet rendu dans Chromium
 * (`page.setContent`, Option B : aucune navigation — ADR-PDF-RENDER).
 * Décisions de sécurité tracées dans ADR-RENDER-SECURITY :
 *
 * - SSR du package partagé (`renderToStaticMarkup` + registre de templates,
 *   repli garanti) : MÊME composant que l'aperçu Next — « aperçu = PDF ».
 * - Modèle d'échappement : TOUTE chaîne utilisateur n'est émise qu'en contexte
 *   TEXTE React (échappée) ; aucune n'atteint un attribut (les attributs ne
 *   portent que le thème, validé par pattern strict #RRGGBB / enum police) ni
 *   un `href` (aucun lien dans le rendu — toute future fonctionnalité « lien »
 *   devra passer une liste blanche de schémas https?: AVANT tout href).
 * - CSP en meta, `default-src 'none'` : pas de directive script-src du tout —
 *   rien ne s'exécute, rien ne se charge ; seul le style inline est permis
 *   (variables du thème + CSS du package embarqué). À réviser à M2-T05
 *   (polices) et jamais au-delà du nécessaire.
 * - Contenu normalisé avant rendu (sanitize.ts : contrôles + bidi).
 * - <title> NEUTRE : ni nom ni donnée du payload (déterminisme M2-T07, zéro
 *   reflet dans les métadonnées PDF).
 *
 * Fonction PURE : le CSS est un paramètre (chargé par css.ts au runtime),
 * aucune E/S — deux appels identiques produisent le même octet.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getTemplate } from "@talentious/cv-render";
import type { GeneratedCVData } from "@talentious/cv-render";
import type { CVTemplateProps } from "@talentious/cv-render";

import { sanitizeForRender } from "./sanitize.js";

/**
 * CSP du document rendu. `script-src 'none'` est EXPLICITE (revue T04) : le
 * fallback default-src suffirait aujourd'hui, mais un futur élargissement de
 * default-src (ex. polices T05) ne doit jamais rouvrir les scripts.
 */
export const CV_PDF_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

/** Langues de document admises (enum du contrat). Garde RUNTIME : `lang` est
 * le seul attribut du document interpolé hors React — même principe que la
 * garde anti-</style>, on n'y fait jamais confiance au seul typage. */
const ALLOWED_LANGUAGES = new Set(["fr", "en"]);

export interface RenderDocumentInput {
  cvContent: GeneratedCVData;
  templateId: string;
  theme: CVTemplateProps["theme"];
  language: NonNullable<CVTemplateProps["language"]>;
  /** CSS du package (dist/cv.css, build M0-T14) — jamais du contenu utilisateur. */
  css: string;
}

export function buildCvDocumentHtml(input: RenderDocumentInput): string {
  // Garde d'intégration, pas d'échappement : le CSS est NOTRE artefact de
  // build. S'il pouvait fermer son <style>, c'est le build qui est compromis
  // — on échoue, on ne « répare » pas.
  if (/<\/style/i.test(input.css)) {
    throw new Error("CSS non embarquable : contient </style> — artefact de build suspect");
  }
  if (!ALLOWED_LANGUAGES.has(input.language)) {
    throw new Error("Langue de document hors liste blanche (contrat DocumentLanguage)");
  }

  const cv = sanitizeForRender(input.cvContent);
  // Défense en profondeur BLK-5, indépendante du template : la sortie interne
  // d'agent ne PEUT pas atteindre le rendu, même si un futur template
  // l'affichait par erreur (le test document le prouve en plus).
  delete (cv as { optimization_notes?: unknown }).optimization_notes;
  const Template = getTemplate(input.templateId);
  const markup = renderToStaticMarkup(
    createElement(Template, { cv, theme: input.theme, language: input.language }),
  );

  return (
    "<!doctype html>" +
    `<html lang="${input.language}">` +
    "<head>" +
    '<meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${CV_PDF_CSP}">` +
    "<title>CV</title>" +
    `<style>${input.css}</style>` +
    "</head>" +
    `<body>${markup}</body>` +
    "</html>"
  );
}
