/**
 * M3-T01 — Helpers de rendu PARTAGÉS (format.ts). Désormais consommés par tous
 * les templates : on verrouille leur comportement sur les cas limites hérités de
 * l'ancien normalizeCVData (documents V1 pré-coercition, valeurs non-chaîne),
 * au-delà de ce que couvrent incidemment les fixtures via les snapshots.
 */
import {
  asText,
  asTextList,
  dateRange,
  deriveCvView,
  formatMonthYear,
  splitSkills,
} from "./format";
import { getCVLocale } from "../i18n";
import type { GeneratedCVData } from "../types";

const fr = getCVLocale("fr");
const en = getCVLocale("en");

describe("formatMonthYear", () => {
  it("formate YYYY-MM et YYYY-MM-DD dans la locale", () => {
    expect(formatMonthYear(fr, "2020-03")).toBe("mars 2020");
    expect(formatMonthYear(fr, "2020-03-15")).toBe("mars 2020");
    expect(formatMonthYear(en, "2020-03")).toBe("Mar 2020");
  });

  it('vide/absent/non-chaîne → "" (jamais un objet comme enfant React)', () => {
    expect(formatMonthYear(fr, "")).toBe("");
    expect(formatMonthYear(fr, null)).toBe("");
    expect(formatMonthYear(fr, undefined)).toBe("");
    expect(formatMonthYear(fr, 42 as unknown as string)).toBe("");
    expect(formatMonthYear(fr, {} as unknown as string)).toBe("");
  });

  it("mois hors plage → année seule ; chaîne non datée → rendue telle quelle", () => {
    expect(formatMonthYear(fr, "2020-13")).toBe("2020");
    expect(formatMonthYear(fr, "2020-00")).toBe("2020");
    expect(formatMonthYear(fr, "en cours")).toBe("en cours");
  });
});

describe("dateRange", () => {
  it("deux bornes → « from — to »", () => {
    expect(dateRange(fr, "2018-01", "2021-02")).toBe("janv. 2018 — févr. 2021");
  });

  it("isCurrent → borne « aujourd'hui » quelle que soit end_date", () => {
    expect(dateRange(fr, "2021-03", null, true)).toBe(
      "mars 2021 — aujourd'hui",
    );
    expect(dateRange(en, "2021-03", "", true)).toBe("Mar 2021 — Present");
  });

  it("borne unique ou aucune", () => {
    expect(dateRange(fr, "2020-05")).toBe("mai 2020");
    expect(dateRange(fr, null, null)).toBe("");
  });
});

describe("splitSkills", () => {
  it("scinde sur « soft » (insensible à la casse), le reste est technique", () => {
    const { hard, soft } = splitSkills([
      { name: "Python", category: "hard_skill" },
      { name: "Écoute", category: "Soft Skill" },
      { name: "SQL", category: "technical" },
      { name: "Empathie", category: "SOFT" },
    ]);
    expect(hard).toEqual(["Python", "SQL"]);
    expect(soft).toEqual(["Écoute", "Empathie"]);
  });

  it("tolère null/undefined, non-tableau, entrées nulles, noms non-chaîne ou vides", () => {
    expect(splitSkills(null)).toEqual({ hard: [], soft: [] });
    expect(splitSkills(undefined)).toEqual({ hard: [], soft: [] });
    // Non-tableau (document corrompu) : pas de crash `.filter`.
    expect(splitSkills("Python" as unknown as [])).toEqual({
      hard: [],
      soft: [],
    });
    const { hard } = splitSkills([
      null,
      undefined,
      { name: "", category: "hard" },
      { name: 42 as unknown as string, category: "hard" },
      { name: "Go", category: undefined },
    ]);
    expect(hard).toEqual(["Go"]);
  });
});

describe("asText / asTextList — coercition défensive (anti-crash Chromium)", () => {
  it("asText : chaîne conservée, tout le reste → ''", () => {
    expect(asText("bonjour")).toBe("bonjour");
    expect(asText("")).toBe("");
    expect(asText(undefined)).toBe("");
    expect(asText(null)).toBe("");
    expect(asText(42)).toBe("");
    expect(asText({})).toBe("");
    expect(asText(["x"])).toBe("");
  });

  it("asTextList : non-tableau → [] ; éléments non-chaîne ou vides écartés", () => {
    expect(asTextList(["a", "b"])).toEqual(["a", "b"]);
    expect(asTextList("Python")).toEqual([]); // chaîne n'est pas une liste
    expect(asTextList(null)).toEqual([]);
    expect(asTextList(undefined)).toEqual([]);
    expect(asTextList(42)).toEqual([]);
    expect(asTextList(["a", 42, "", null, "b", {}])).toEqual(["a", "b"]);
  });
});

describe("deriveCvView", () => {
  const base = {
    personal_info: {
      first_name: "Camille",
      last_name: "Martin",
      email: "c@example.com",
      city: "Lyon",
      country: "France",
    },
    selected_experiences: [{ id: "e1", title: "Dev", company: "ACME" }],
    highlighted_skills: [
      { name: "Python", category: "hard" },
      { name: "Écoute", category: "soft" },
    ],
  } as unknown as GeneratedCVData;

  it("dérive identité, contacts et compétences scindées ; langue appliquée", () => {
    const v = deriveCvView(base, "fr");
    expect(v.fullName).toBe("Camille Martin");
    expect(v.contactBits).toEqual(["c@example.com", "Lyon, France"]);
    expect(v.hardSkills).toEqual(["Python"]);
    expect(v.softSkills).toEqual(["Écoute"]);
    expect(v.t.sections.profile).toBe("Profil");
    expect(deriveCvView(base, "en").t.sections.profile).toBe("Summary");
  });

  it("listes absentes → tableaux vides (jamais undefined mappé)", () => {
    const v = deriveCvView({ personal_info: {} } as unknown as GeneratedCVData);
    expect(v.fullName).toBe("");
    expect(v.contactBits).toEqual([]);
    expect(v.experiences).toEqual([]);
    expect(v.educations).toEqual([]);
    expect(v.projects).toEqual([]);
    expect(v.certifications).toEqual([]);
    expect(v.hardSkills).toEqual([]);
    expect(v.softSkills).toEqual([]);
  });

  it("expose firstName/lastName/summary normalisés (trim ; cohérent avec fullName)", () => {
    const v = deriveCvView({
      personal_info: { first_name: "  Camille  ", last_name: " Martin " },
      summary: "Résumé.",
    } as unknown as GeneratedCVData);
    expect(v.firstName).toBe("Camille");
    expect(v.lastName).toBe("Martin");
    expect(v.fullName).toBe("Camille Martin");
    expect(v.summary).toBe("Résumé.");
  });

  it("DOCUMENT CORROMPU : champs non-chaîne coercés, entrées nulles écartées, aucun crash", () => {
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

    const v = deriveCvView(corrupt);
    // Identité/contacts : tout non-chaîne → '' ; contactBits ne garde que le réel.
    expect(v.firstName).toBe("");
    expect(v.summary).toBe("");
    expect(v.contactBits).toEqual([]);
    // Entrées : l'élément null est écarté ; les champs texte sont des chaînes.
    expect(v.experiences).toHaveLength(1);
    expect(v.experiences[0].title).toBe("");
    expect(v.experiences[0].description).toBe("");
    expect(v.experiences[0].highlighted_skills).toEqual([]); // "x" n'est pas une liste
    expect(v.educations).toEqual([]); // "nope" n'est pas un tableau
    expect(v.projects[0].name).toBe("");
    expect(v.projects[0].relevant_skills).toEqual([]);
    // L'entrée certif non-objet (123) est écartée, l'objet corrompu normalisé.
    expect(v.certifications).toHaveLength(1);
    expect(v.certifications[0].name).toBe("");
    // Aucune valeur rendue n'est un objet (invariant anti-« [object Object] »).
    for (const s of [
      v.firstName,
      v.lastName,
      v.summary,
      v.experiences[0].title,
      v.projects[0].name,
      v.certifications[0].name,
    ]) {
      expect(typeof s).toBe("string");
    }
  });
});
