/**
 * M3 (revue tech+creatif) — robustesse de rendu PARAMÉTRÉE sur TOUS les
 * templates du registre. Deux invariants que chaque template doit tenir, quel
 * que soit son habillage :
 *   1. Sections vides : aucun `<h2>` orphelin ni libellé de groupe sans contenu.
 *   2. Document corrompu : un `cv_data_json` dont des champs texte sont des
 *      objets/tableaux ne doit JAMAIS faire planter le rendu (le même rendu
 *      alimente le Chromium serveur de l'export — un crash = PDF non produit).
 *
 * La garde réelle vit dans `deriveCvView` (coercition `asText`/`asTextList`,
 * entrées nulles écartées) : ce test prouve qu'ELLE protège bien CHAQUE template,
 * y compris les futurs (itération sur TEMPLATE_IDS).
 */
import { render } from "@testing-library/react";
import { getTemplate, TEMPLATE_IDS } from "./registry";
import type { GeneratedCVData } from "../types";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe.each(TEMPLATE_IDS.map((id) => [id] as const))(
  "robustesse de rendu — template « %s »",
  (templateId) => {
    const Template = getTemplate(templateId);

    it("sections vides : seule la section Profil (summary) a un titre, aucun libellé orphelin", () => {
      const onlySummary = {
        personal_info: {
          first_name: "Alex",
          last_name: "Durand",
          email: "alex@example.com",
        },
        summary: "Profil synthétique.",
        highlighted_skills: [],
        selected_experiences: [],
        selected_educations: [],
        selected_projects: [],
        selected_certifications: [],
      } as unknown as GeneratedCVData;

      const { container } = render(<Template cv={onlySummary} />);
      const titles = Array.from(container.querySelectorAll("h2"));
      // Un seul titre de section : « Profil » (les sections vides sont omises).
      expect(titles).toHaveLength(1);
      expect(titles[0].textContent).toContain("Profil");
      const text = container.textContent ?? "";
      // Aucun libellé de section/groupe sans contenu derrière.
      expect(text).not.toContain("Expérience");
      expect(text).not.toContain("Compétences");
      expect(text).not.toContain("Techniques"); // groupe hard orphelin
      expect(text).not.toContain("Transversales"); // groupe soft orphelin
      expect(text).not.toContain("Projets");
      expect(text).not.toContain("Formation");
      expect(text).not.toContain("Certifications");
    });

    it("document corrompu (champs texte en objet/tableau) : le rendu NE PLANTE PAS", () => {
      const corrupt = {
        personal_info: {
          first_name: {},
          last_name: [],
          email: 42,
          phone: {},
          city: null,
          country: undefined,
          linkedin: ["x"],
        },
        summary: { bad: 1 },
        highlighted_skills: "pas-un-tableau",
        selected_experiences: [
          null,
          {
            id: "e",
            title: {},
            company: [],
            description: 7,
            location: {},
            start_date: {},
            end_date: [],
            highlighted_skills: "x",
          },
        ],
        selected_educations: "nope",
        selected_projects: [{ name: {}, relevant_skills: 99 }],
        selected_certifications: [123, { name: {}, issuer: [] }],
      } as unknown as GeneratedCVData;

      expect(() => render(<Template cv={corrupt} />)).not.toThrow();
      // Et aucun « [object Object] » ne fuit dans le rendu.
      const { container } = render(<Template cv={corrupt} />);
      expect(container.textContent ?? "").not.toContain("[object Object]");
    });
  },
);
