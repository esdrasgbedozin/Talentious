/**
 * M3-T03 — Template « Tech » (tech).
 *
 * Mêmes fixtures canoniques partagées (`fixtures/cv-reference/*.json`) que les
 * autres templates : un template ne transforme JAMAIS le contenu, il n'en change
 * que la STRUCTURE visuelle (ADR-CONTENT-SCHEMA / ADR-THEME-DECOUPLED). DoD du
 * ticket : snapshots des 3 fixtures. On verrouille aussi la personnalité tech
 * (« stack d'abord », tags à bordure), l'absence de jauge/icône, et on reprend
 * les garde-fous de sécurité de rendu (échappement, aucun lien,
 * `optimization_notes` jamais rendu) : tech alimente le même Chromium d'export.
 */
import { render } from "@testing-library/react";
import Tech from "./Tech";
import { getTemplate } from "./registry";
import type { GeneratedCVData } from "../types";
import completeJson from "../../../../fixtures/cv-reference/complete.json";
import minimalJson from "../../../../fixtures/cv-reference/minimal.json";
import denseJson from "../../../../fixtures/cv-reference/dense.json";

const complete = completeJson as unknown as GeneratedCVData;
const minimal = minimalJson as unknown as GeneratedCVData;
const dense = denseJson as unknown as GeneratedCVData;

beforeAll(() => {
  // CvSheet instancie un ResizeObserver (absent de jsdom).
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("Tech — rend les fixtures canoniques GeneratedCVData (M3-T03)", () => {
  it("est le composant résolu pour le template_id « tech »", () => {
    expect(getTemplate("tech")).toBe(Tech);
  });

  it.each([
    ["complete", complete],
    ["minimal", minimal],
    ["dense", dense],
  ])("rend le CV « %s » sans corps vide", (_name, cv) => {
    const { container } = render(<Tech cv={cv} />);
    const text = container.textContent ?? "";
    expect(text).toContain(cv.personal_info.first_name);
    expect(text).toContain(cv.selected_experiences[0].title);
    expect(text).toContain(cv.selected_experiences[0].company);
    expect(text).toContain(cv.summary);
  });

  it.each([
    ["complete", complete],
    ["minimal", minimal],
    ["dense", dense],
  ])("snapshot du CV « %s »", (_name, cv) => {
    const { container } = render(<Tech cv={cv} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("mappe les sections canoniques : skills par catégorie, formation, projet, certification", () => {
    const { container } = render(<Tech cv={complete} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Techniques"); // hard skills
    expect(text).toContain("Architecture distribuée");
    expect(text).toContain("Transversales"); // soft skills
    expect(text).toContain("Communication");
    expect(text).toContain("INSA Lyon"); // selected_educations
    expect(text).toContain("Observatoire open data des mobilités"); // selected_projects
    expect(text).toContain("GTFS"); // relevant_skills du projet
    expect(text).toContain("Professional Cloud Architect"); // selected_certifications
    expect(text).toContain("Google Cloud");
  });

  it("end_date null ⇒ poste en cours (« aujourd'hui ») ; l'expérience terminée garde ses dates", () => {
    const { container } = render(<Tech cv={complete} />);
    const text = container.textContent ?? "";
    expect(text).toContain("mars 2021 — aujourd'hui");
    expect(text).toContain("janv. 2018 — févr. 2021");
  });
});

describe("Tech — personnalité « stack d'abord »", () => {
  it("rend la section Compétences AVANT l'Expérience (ordre DOM, distinct de modern/corporate)", () => {
    const { container } = render(<Tech cv={complete} />);
    const titles = Array.from(container.querySelectorAll("h2")).map(
      (h) => h.textContent ?? "",
    );
    const idxSkills = titles.findIndex((t) => t.includes("Compétences"));
    const idxExp = titles.findIndex((t) =>
      t.includes("Expérience professionnelle"),
    );
    expect(idxSkills).toBeGreaterThanOrEqual(0);
    expect(idxExp).toBeGreaterThan(idxSkills);
  });

  it("chaque titre de section porte un marqueur décoratif NON-TEXTE (rien dans la couche texte du PDF lue par un ATS)", () => {
    const { container } = render(<Tech cv={complete} />);
    const titles = Array.from(container.querySelectorAll("h2"));
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      const marker = title.querySelector('[aria-hidden="true"]');
      expect(marker).not.toBeNull();
      // Pas un glyphe texte (« # ») : un aplat accent, donc aucun caractère
      // parasite extrait par un ATS devant « COMPÉTENCES », « PROFIL », etc.
      expect(marker?.textContent).toBe("");
      expect(marker?.getAttribute("style") ?? "").toContain("var(--cv-accent)");
    }
  });
});

describe("Tech — compétences en tags, jamais de barre ni d'icône", () => {
  it.each([
    ["complete", complete],
    ["minimal", minimal],
    ["dense", dense],
  ])("ne pose ni icône ni jauge graphique (%s)", (_name, cv) => {
    const { container } = render(<Tech cv={cv} />);
    // Aucune icône (svg/img/canvas) ni jauge native (progress/meter/role).
    expect(
      container.querySelector(
        'svg, img, canvas, progress, meter, [role="progressbar"], [role="meter"]',
      ),
    ).toBeNull();
    // Aucune jauge « maison » : pas d'élément dont le style porte une largeur en
    // pourcentage (le tell d'une barre de niveau rendue en div).
    const widthBars = Array.from(
      container.querySelectorAll<HTMLElement>("[style]"),
    ).filter((el) =>
      /width:\s*\d+(?:\.\d+)?%/.test(el.getAttribute("style") ?? ""),
    );
    expect(widthBars).toEqual([]);
  });

  it("les compétences de la section sont des tags à bordure (texte), pas des pastilles pleines ni des barres", () => {
    const { container } = render(<Tech cv={complete} />);
    // Les tags portent le NOM de la compétence (information écrite) et une
    // bordure thémable — jamais un remplissage de jauge.
    const tags = Array.from(
      container.querySelectorAll<HTMLElement>("span.border"),
    );
    expect(tags.length).toBeGreaterThan(0);
    const tagText = tags.map((el) => el.textContent).join(" ");
    expect(tagText).toContain("Python");
    for (const tag of tags) {
      const style = tag.getAttribute("style") ?? "";
      expect(style).toContain("var(--cv-muted)"); // bordure thémable
      expect(style).not.toMatch(/background/); // pas de remplissage
    }
  });
});

describe("Tech — garde-fous de rendu serveur (hérités de modern_sobre)", () => {
  it("ne rend JAMAIS optimization_notes (champ interne, BLK-5)", () => {
    const hostile = {
      ...complete,
      optimization_notes: "NOTE-INTERNE-NE-JAMAIS-AFFICHER",
    } as GeneratedCVData;
    const { container } = render(<Tech cv={hostile} />);
    expect(container.textContent).not.toContain(
      "NOTE-INTERNE-NE-JAMAIS-AFFICHER",
    );
    expect(container.innerHTML).not.toContain(
      "NOTE-INTERNE-NE-JAMAIS-AFFICHER",
    );
  });

  it("échappe le contenu hostile : aucun élément script/img/b créé, texte littéral rendu", () => {
    const hostile = {
      ...complete,
      summary: "Avant <script>alert(1)</script> après",
      selected_experiences: [
        {
          ...complete.selected_experiences[0],
          description: "<img src=x onerror=alert(1)>",
          highlighted_skills: ["<b>gras</b>"],
        },
      ],
    } as GeneratedCVData;
    const { container } = render(<Tech cv={hostile} />);
    expect(container.querySelector("script, img, b")).toBeNull();
    const text = container.textContent ?? "";
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain("<img src=x onerror=alert(1)>");
    expect(text).toContain("<b>gras</b>");
  });

  it("aucun lien généré, même avec des URLs javascript:", () => {
    const withUrls = {
      ...complete,
      personal_info: {
        ...complete.personal_info,
        linkedin: "javascript:alert(1)",
      },
      selected_projects: [
        {
          ...(complete.selected_projects ?? [])[0],
          url: "javascript:alert(2)",
        },
      ],
      selected_certifications: [
        {
          ...(complete.selected_certifications ?? [])[0],
          url: "javascript:alert(3)",
        },
      ],
    } as GeneratedCVData;
    const { container } = render(<Tech cv={withUrls} />);
    expect(container.querySelector("a, [href]")).toBeNull();
  });
});

describe("Tech — i18n d'enveloppe et dates de toutes les sections", () => {
  it("language=en : libellés de sections, mois et « Present » traduits", () => {
    const { container } = render(<Tech cv={complete} language="en" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Summary");
    expect(text).toContain("Professional Experience");
    expect(text).toContain("Education");
    expect(text).toContain("Skills");
    expect(text).toContain("Projects");
    expect(text).toContain("Certifications");
    expect(text).toContain("Mar 2021 — Present");
  });

  it("formate les dates de formation, projet et certification (pas seulement l'expérience)", () => {
    const { container } = render(<Tech cv={complete} />);
    const text = container.textContent ?? "";
    expect(text).toContain("sept. 2017"); // selected_educations[0].end_date
    expect(text).toContain("juin 2022"); // selected_projects[0].completion_date
    expect(text).toContain("avr. 2023"); // selected_certifications[0].issue_date
  });
});

describe("Tech — thème snapshoté appliqué sur .cv-sheet (ADR-THEME-DECOUPLED)", () => {
  it("un thème custom pose ses variables --cv-* sur la racine", () => {
    const { container } = render(
      <Tech
        cv={complete}
        theme={{
          color_accent: "#B45309",
          color_text: "#111827",
          color_muted: "#6B7280",
          color_background: "#FFFFFF",
          font_heading: "Lora",
          font_body: "Inter",
        }}
      />,
    );
    const style = container.firstElementChild?.getAttribute("style") ?? "";
    expect(style).toContain("--cv-accent");
    expect(style).toContain("#B45309");
    expect(style).toContain("Lora");
  });

  it("un thème hostile (couleur hors #RRGGBB) retombe sur le défaut anthracite", () => {
    const { container } = render(
      <Tech
        cv={complete}
        theme={{ color_accent: "red; background:url(x)" } as never}
      />,
    );
    const style = container.firstElementChild?.getAttribute("style") ?? "";
    expect(style).toContain("#2D3748"); // défaut D2 (anti-injection)
    expect(style).not.toContain("url(");
  });
});

describe("Tech — fit une-page via la coquille partagée (parité modern_sobre)", () => {
  let original: PropertyDescriptor | undefined;

  beforeAll(() => {
    original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 2400, // > hauteur A4 utile (~1017px) ⇒ scale plafonné à MIN_SCALE
    });
  });

  afterAll(() => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", original);
    } else {
      delete (HTMLElement.prototype as unknown as { scrollHeight?: number })
        .scrollHeight;
    }
  });

  it("applique un transform: scale(<1) quand le contenu déborde (dense)", () => {
    const { container } = render(<Tech cv={dense} />);
    const scaled = container.querySelector<HTMLElement>('[style*="scale"]');
    expect(scaled).not.toBeNull();
    const match = /scale\(([0-9.]+)\)/.exec(scaled!.style.transform);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThan(1);
  });
});
