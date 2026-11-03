/**
 * M3-T05 — Template « Créatif » (creatif).
 *
 * Mêmes fixtures canoniques partagées que les autres templates : un template ne
 * transforme JAMAIS le contenu, il n'en change que la STRUCTURE visuelle
 * (ADR-CONTENT-SCHEMA / ADR-THEME-DECOUPLED). DoD du ticket : snapshots des 3
 * fixtures ET « texte lisible indépendamment du décor » — vérifié ici par deux
 * invariants : (a) tout élément à fond coloré est décoratif (aria-hidden, sans
 * texte), (b) le texte en accent (prénom, titres) reste sur le fond et passe
 * WCAG AA avec le thème par défaut. On reprend aussi les garde-fous de sécurité
 * de rendu (échappement, aucun lien, optimization_notes jamais rendu).
 */
import { render } from "@testing-library/react";
import Creatif from "./Creatif";
import { getTemplate } from "./registry";
import { contrastRatio, WCAG_AA_NORMAL } from "../contrast";
import { DEFAULT_CV_THEME_TOKENS } from "../theme";
import type { GeneratedCVData } from "../types";
import completeJson from "../../../../fixtures/cv-reference/complete.json";
import minimalJson from "../../../../fixtures/cv-reference/minimal.json";
import denseJson from "../../../../fixtures/cv-reference/dense.json";

const complete = completeJson as unknown as GeneratedCVData;
const minimal = minimalJson as unknown as GeneratedCVData;
const dense = denseJson as unknown as GeneratedCVData;

/** Compose `fg` (hex #RRGGBB) à l'opacité `alpha` sur `bg` opaque → hex opaque.
 * Reproduit `color-mix(in srgb, fg (alpha*100)%, transparent)` rendu sur `bg`,
 * pour mesurer le contraste réel du texte des pilules sur leur tint. */
function blendOver(fg: string, alpha: number, bg: string): string {
  const ch = (hex: string, i: number) =>
    parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = (i: number) =>
    Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha));
  return (
    "#" + [0, 1, 2].map((i) => mix(i).toString(16).padStart(2, "0")).join("")
  );
}

beforeAll(() => {
  // CvSheet instancie un ResizeObserver (absent de jsdom).
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("Creatif — rend les fixtures canoniques GeneratedCVData (M3-T05)", () => {
  it("est le composant résolu pour le template_id « creatif »", () => {
    expect(getTemplate("creatif")).toBe(Creatif);
  });

  it.each([
    ["complete", complete],
    ["minimal", minimal],
    ["dense", dense],
  ])("rend le CV « %s » sans corps vide", (_name, cv) => {
    const { container } = render(<Creatif cv={cv} />);
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
    const { container } = render(<Creatif cv={cv} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("mappe les sections canoniques : skills par catégorie, formation, projet, certification", () => {
    const { container } = render(<Creatif cv={complete} />);
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
    const { container } = render(<Creatif cv={complete} />);
    const text = container.textContent ?? "";
    expect(text).toContain("mars 2021 — aujourd'hui");
    expect(text).toContain("janv. 2018 — févr. 2021");
  });
});

describe("Creatif — en-tête éditorial bichrome", () => {
  it("rend le prénom en accent et le nom en couleur de texte (deux spans distincts)", () => {
    const { container } = render(<Creatif cv={complete} />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Camille");
    const accentSpan = Array.from(h1?.querySelectorAll("span") ?? []).find(
      (s) => (s.getAttribute("style") ?? "").includes("var(--cv-accent)"),
    );
    expect(accentSpan?.textContent).toBe("Camille"); // prénom en accent
  });
});

describe("Creatif — DoD : texte lisible indépendamment du décor", () => {
  it.each([
    ["complete", complete],
    ["minimal", minimal],
    ["dense", dense],
  ])(
    "tout élément à fond coloré est décoratif (aria-hidden) et SANS texte (%s)",
    (_name, cv) => {
      const { container } = render(<Creatif cv={cv} />);
      // Les aplats pleins (backgroundColor: var(--cv-accent), sans color-mix
      // transparent) sont du décor pur : aria-hidden et sans contenu textuel.
      const solidFills = Array.from(
        container.querySelectorAll<HTMLElement>("[style]"),
      ).filter((el) => {
        const style = el.getAttribute("style") ?? "";
        return (
          /background(?:-color)?:\s*var\(--cv-accent\)/.test(style) &&
          !style.includes("color-mix")
        );
      });
      expect(solidFills.length).toBeGreaterThan(0); // la barre d'accent du header
      for (const el of solidFills) {
        expect(el.getAttribute("aria-hidden")).toBe("true");
        expect(el.textContent).toBe(""); // aucun texte posé sur l'aplat
      }
    },
  );

  it("les pilules de compétences portent le texte en --cv-text (jamais sur l'accent)", () => {
    const { container } = render(<Creatif cv={complete} />);
    const pills = Array.from(
      container.querySelectorAll<HTMLElement>("span.rounded-full.border"),
    );
    expect(pills.length).toBeGreaterThan(0);
    expect(pills.map((p) => p.textContent).join(" ")).toContain("Python");
    for (const pill of pills) {
      expect(pill.getAttribute("style") ?? "").toContain(
        "color: var(--cv-text)",
      );
    }
  });

  it("avec le thème par défaut, toute l'encre passe WCAG AA sur son support réel", () => {
    const { color_accent, color_text, color_muted, color_background } =
      DEFAULT_CV_THEME_TOKENS;
    // Texte en accent (prénom, titres) et texte courant : posés sur le FOND.
    expect(
      contrastRatio(color_accent, color_background),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(contrastRatio(color_text, color_background)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
    // Muted : porte dates/contacts/lieux en petit corps → même seuil 4.5 exigé.
    expect(contrastRatio(color_muted, color_background)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
    // Pilules : le texte (--cv-text) n'est PAS sur le fond mais sur un tint accent
    // 10 % composé sur le fond (color-mix). On mesure sur ce support EFFECTIF, pas
    // sur le fond (constat de revue Q3).
    const pillBg = blendOver(color_accent, 0.1, color_background);
    expect(contrastRatio(color_text, pillBg)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
  });

  it("ne pose ni icône ni jauge graphique (pas de barre de niveau en width %)", () => {
    const { container } = render(<Creatif cv={dense} />);
    expect(
      container.querySelector(
        'svg, img, canvas, progress, meter, [role="progressbar"], [role="meter"]',
      ),
    ).toBeNull();
    const widthBars = Array.from(
      container.querySelectorAll<HTMLElement>("[style]"),
    ).filter((el) =>
      /width:\s*\d+(?:\.\d+)?%/.test(el.getAttribute("style") ?? ""),
    );
    expect(widthBars).toEqual([]);
  });
});

describe("Creatif — garde-fous de rendu serveur (hérités de modern_sobre)", () => {
  it("ne rend JAMAIS optimization_notes (champ interne, BLK-5)", () => {
    const hostile = {
      ...complete,
      optimization_notes: "NOTE-INTERNE-NE-JAMAIS-AFFICHER",
    } as GeneratedCVData;
    const { container } = render(<Creatif cv={hostile} />);
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
    const { container } = render(<Creatif cv={hostile} />);
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
    const { container } = render(<Creatif cv={withUrls} />);
    expect(container.querySelector("a, [href]")).toBeNull();
  });
});

describe("Creatif — i18n d'enveloppe et dates de toutes les sections", () => {
  it("language=en : libellés de sections, mois et « Present » traduits", () => {
    const { container } = render(<Creatif cv={complete} language="en" />);
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
    const { container } = render(<Creatif cv={complete} />);
    const text = container.textContent ?? "";
    expect(text).toContain("sept. 2017"); // selected_educations[0].end_date
    expect(text).toContain("juin 2022"); // selected_projects[0].completion_date
    expect(text).toContain("avr. 2023"); // selected_certifications[0].issue_date
  });
});

describe("Creatif — thème snapshoté appliqué sur .cv-sheet (ADR-THEME-DECOUPLED)", () => {
  it("un thème custom pose ses variables --cv-* sur la racine", () => {
    const { container } = render(
      <Creatif
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
      <Creatif
        cv={complete}
        theme={{ color_accent: "red; background:url(x)" } as never}
      />,
    );
    const style = container.firstElementChild?.getAttribute("style") ?? "";
    expect(style).toContain("#2D3748"); // défaut D2 (anti-injection)
    expect(style).not.toContain("url(");
  });
});

describe("Creatif — fit une-page via la coquille partagée (parité modern_sobre)", () => {
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
    const { container } = render(<Creatif cv={dense} />);
    const scaled = container.querySelector<HTMLElement>('[style*="scale"]');
    expect(scaled).not.toBeNull();
    const match = /scale\(([0-9.]+)\)/.exec(scaled!.style.transform);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThan(1);
  });
});
