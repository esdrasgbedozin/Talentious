/**
 * Garde-fou typographique (consigne Esdras, CLAUDE.md §2) : aucun tiret cadratin
 * « \u2014 » (U+2014) ne doit être RENDU dans un CV — les documents sont remis en
 * PDF aux utilisateurs. Les 4 templates partagent les blocs qui injectaient ce
 * caractère (poste/entreprise, certif/organisme, plage de dates) ; ce test
 * paramétré verrouille les 4 à la fois, en FR et EN, au-delà des snapshots (qui
 * n'attrapent pas l'ajout d'un futur « \u2014 » dans un nouveau bloc de template).
 *
 * Portée : séparateurs INJECTÉS par le code. Les fixtures canoniques sont sans
 * cadratin (vérifié) ; un « \u2014 » saisi par l'utilisateur ou produit par l'agent
 * IA dans le CONTENU est un foyer distinct, hors de ce package.
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

describe("aucun tiret cadratin rendu dans les templates (consigne typo)", () => {
  const languages: DocumentLanguage[] = ["fr", "en"];
  const cases: [string, DocumentLanguage][] = TEMPLATE_IDS.flatMap((id) =>
    languages.map((lang): [string, DocumentLanguage] => [id, lang]),
  );

  it.each(cases)(
    "template « %s » (langue %s) ne rend aucun cadratin",
    (id, lang) => {
      const Template = getTemplate(id);
      const { container } = render(<Template cv={complete} language={lang} />);
      expect(container.textContent ?? "").not.toContain(EM_DASH);
    },
  );
});
