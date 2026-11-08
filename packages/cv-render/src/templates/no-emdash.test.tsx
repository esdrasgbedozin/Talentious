/**
 * Garde-fou typographique (consigne Esdras, CLAUDE.md §2) : aucun tiret cadratin
 * « \u2014 » (U+2014) ne doit être RENDU dans un CV — les documents sont remis en
 * PDF aux utilisateurs. Les 4 templates partagent les blocs qui injectaient ce
 * caractère (poste/entreprise, certif/organisme, plage de dates) ; ce test
 * paramétré verrouille les 4 à la fois, en FR et EN, au-delà des snapshots (qui
 * n'attrapent pas l'ajout d'un futur « \u2014 » dans un nouveau bloc de template).
 *
 * Deux portées verrouillées ici : (1) séparateurs INJECTÉS par le code (fixtures
 * canoniques, sans cadratin) ; (2) cadratin présent dans le CONTENU lui-même
 * (titre/description/intitulé rédigés par l'agent IA, ou saisis), neutralisé au
 * seuil du view-model (normalizeTypography dans asText/asTextList/splitSkills) et
 * donc jamais rendu.
 */
import { render } from "@testing-library/react";
import { getTemplate, TEMPLATE_IDS } from "./registry";
import type { DocumentLanguage } from "../i18n";
import type { GeneratedCVData } from "../types";
import completeJson from "../../../../fixtures/cv-reference/complete.json";

const complete = completeJson as unknown as GeneratedCVData;
const EM_DASH = "\u2014"; // tiret cadratin —, banni du texte rendu

beforeAll(() => {
  // CvSheet instancie un ResizeObserver (absent de jsdom).
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// Matrice partagée par les deux portées : 4 templates × { fr, en }.
const languages: DocumentLanguage[] = ["fr", "en"];
const cases: [string, DocumentLanguage][] = TEMPLATE_IDS.flatMap((id) =>
  languages.map((lang): [string, DocumentLanguage] => [id, lang]),
);

describe("aucun tiret cadratin rendu dans les templates (consigne typo)", () => {
  it.each(cases)(
    "template « %s » (langue %s) ne rend aucun cadratin",
    (id, lang) => {
      const Template = getTemplate(id);
      const { container } = render(<Template cv={complete} language={lang} />);
      expect(container.textContent ?? "").not.toContain(EM_DASH);
    },
  );
});

const CONTENT_SECTIONS = [
  "selected_experiences",
  "selected_educations",
  "selected_projects",
  "selected_certifications",
  "highlighted_skills",
] as const;

describe("le cadratin du CONTENU (rédigé par l'IA) est neutralisé au rendu", () => {
  // Document canonique cloné puis pollué de cadratins dans TOUS les champs de
  // contenu que l'agent rédige (résumé, intitulés, sociétés, établissements,
  // descriptions, noms, émetteurs, compétences de liste). Aucun ne doit être
  // rendu tel quel, quel que soit le template.
  const withEmDash = (): GeneratedCVData => {
    const cv = JSON.parse(JSON.stringify(complete)) as Record<string, unknown>;
    const first = (key: string) =>
      (cv[key] as Record<string, unknown>[] | undefined)?.[0];
    cv.summary = `Ingénieur ${EM_DASH} orienté produit`;
    const exp = first("selected_experiences");
    if (exp) {
      exp.title = `Lead ${EM_DASH} Plateforme`;
      exp.company = `ACME ${EM_DASH} Cloud`;
      exp.description = `Réalisations\n${EM_DASH} Déploiement\n${EM_DASH} Monitoring`;
      exp.highlighted_skills = [`Go ${EM_DASH} concurrence`];
    }
    const edu = first("selected_educations");
    if (edu) {
      edu.degree = `Master ${EM_DASH} Informatique`;
      edu.institution = `Université ${EM_DASH} Paris`;
      edu.description = `Spécialité ${EM_DASH} systèmes`;
    }
    const proj = first("selected_projects");
    if (proj) {
      proj.name = `Talentious ${EM_DASH} SaaS`;
      proj.description = `Génération 2018${EM_DASH}2021 de CV`;
      proj.relevant_skills = [`React ${EM_DASH} 19`];
    }
    const cert = first("selected_certifications");
    if (cert) {
      cert.name = `PCA ${EM_DASH} v2`;
      cert.issuer = `Google ${EM_DASH} Cloud`;
    }
    const skill = first("highlighted_skills");
    if (skill) skill.name = `Cloud ${EM_DASH} GCP`;
    return cv as unknown as GeneratedCVData;
  };

  it("précondition : les sections polluées existent et portent des cadratins", () => {
    // Garde-fou du garde-fou : si une évolution de complete.json vidait une
    // section, les `if` ci-dessus deviendraient des no-op et le test passerait
    // sans rien vérifier. On exige donc que chaque section soit non vide.
    const cv = withEmDash() as unknown as Record<string, unknown[]>;
    for (const key of CONTENT_SECTIONS) {
      expect(Array.isArray(cv[key]) && cv[key].length > 0).toBe(true);
    }
    expect(JSON.stringify(cv)).toContain(EM_DASH);
  });

  it.each(cases)(
    "template « %s » (langue %s) ne rend aucun cadratin de contenu",
    (id, lang) => {
      const Template = getTemplate(id);
      const { container } = render(
        <Template cv={withEmDash()} language={lang} />,
      );
      expect(container.textContent ?? "").not.toContain(EM_DASH);
    },
  );
});
