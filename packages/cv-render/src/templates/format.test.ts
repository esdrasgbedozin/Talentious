/**
 * M3-T01 — Helpers de rendu PARTAGÉS (format.ts). Désormais consommés par tous
 * les templates : on verrouille leur comportement sur les cas limites hérités de
 * l'ancien normalizeCVData (documents V1 pré-coercition, valeurs non-chaîne),
 * au-delà de ce que couvrent incidemment les fixtures via les snapshots.
 */
import {
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

  it("tolère null/undefined, entrées nulles, noms non-chaîne ou vides", () => {
    expect(splitSkills(null)).toEqual({ hard: [], soft: [] });
    expect(splitSkills(undefined)).toEqual({ hard: [], soft: [] });
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
});
