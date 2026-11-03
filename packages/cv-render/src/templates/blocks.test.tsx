/**
 * DET-M3-TEMPLATES — blocs de contenu PARTAGÉS (blocks.tsx). Extraits du JSX
 * dupliqué des 4 templates ; la parité DOM avec l'ancien inline est déjà
 * verrouillée par les snapshots de chaque template. On teste ici le
 * COMPORTEMENT propre des unités (cas limites, slots, séparateurs) directement,
 * sans dépendre d'un template particulier.
 */
import { render } from "@testing-library/react";
import {
  CertificationEntry,
  ContactLine,
  EducationEntry,
  ExperienceEntry,
  InlineSkills,
  ProjectEntry,
  SlashSeparator,
} from "./blocks";
import { getCVLocale } from "../i18n";

const t = getCVLocale("fr");

describe("ContactLine", () => {
  it("liste vide → ne rend rien (parité avec le garde inline d'origine)", () => {
    const { container } = render(
      <ContactLine bits={[]} className="text-[10px]" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("séquence des items EXACTE, sans aucun caractère de séparation dans le texte (anti-ATS)", () => {
    const { container } = render(
      // Classe SENTINELLE (pas une classe Tailwind) : on teste la transmission,
      // pas un style — un restylage ne casse pas ce test (dette c).
      <ContactLine
        bits={["a@ex.com", "+33", "Lyon"]}
        className="contact-row"
      />,
    );
    // Le texte extractible (couche PDF lue par un ATS) = les seuls items, dans
    // l'ordre, SANS glyphe de séparation (« • »/« / » bannis de la couche texte).
    expect(container.textContent).toBe("a@ex.com+33Lyon");
    // La className passée est portée VERBATIM par le paragraphe (personnalité du
    // template, transmise telle quelle).
    expect(container.querySelector("p")?.getAttribute("class")).toBe(
      "contact-row",
    );
  });

  it("insère un séparateur DÉCOR non-texte ENTRE les items seulement (n−1)", () => {
    const { container } = render(
      <ContactLine bits={["a@ex.com", "+33", "Lyon"]} className="x" />,
    );
    const seps = container.querySelectorAll('[aria-hidden="true"]');
    expect(seps).toHaveLength(2); // 3 items → 2 séparateurs
    for (const sep of seps) {
      expect(sep.textContent).toBe(""); // décor pur, rien à extraire
      expect(sep.getAttribute("style") ?? "").toContain("var(--cv-muted)");
    }
  });

  it("un seul item ⇒ aucun séparateur (ni texte, ni décor)", () => {
    const { container } = render(
      <ContactLine bits={["solo@ex.com"]} className="x" />,
    );
    expect(container.textContent).toBe("solo@ex.com");
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });

  it("séparateur personnalisable (tech utilise la barre oblique), toujours non-texte", () => {
    const { container } = render(
      <ContactLine
        bits={["a", "b"]}
        className="x"
        separator={SlashSeparator}
      />,
    );
    // Aucun glyphe « / » parasite ; le séparateur fourni est bien du décor.
    expect(container.textContent).toBe("ab");
    const seps = container.querySelectorAll('[aria-hidden="true"]');
    expect(seps).toHaveLength(1);
    expect(seps[0].textContent).toBe("");
  });
});

describe("InlineSkills", () => {
  it("liste vide ou tout-falsy → ne rend rien", () => {
    expect(
      render(<InlineSkills skills={[]} />).container.firstChild,
    ).toBeNull();
    expect(
      render(<InlineSkills skills={["", ""]} />).container.firstChild,
    ).toBeNull();
  });

  it("joint les compétences par « · » en écartant les valeurs falsy", () => {
    const { container } = render(
      <InlineSkills skills={["Python", "", "SQL"]} />,
    );
    expect(container.textContent).toBe("Python · SQL");
  });

  it("transmet la className VERBATIM ; applique un défaut non vide quand elle est omise", () => {
    // className explicite → transmise telle quelle (sentinelle, pas Tailwind :
    // la valeur exacte du défaut relève du snapshot, pas de ce test — dette c).
    expect(
      render(<InlineSkills skills={["x"]} className="skills-sentinel" />)
        .container.querySelector("p")
        ?.getAttribute("class"),
    ).toBe("skills-sentinel");
    // Omise → un défaut non vide est posé (la marge par défaut existe).
    expect(
      render(<InlineSkills skills={["x"]} />)
        .container.querySelector("p")
        ?.getAttribute("class"),
    ).toBeTruthy();
  });
});

describe("ExperienceEntry", () => {
  const base = {
    id: "e1",
    title: "Développeur",
    company: "ACME",
    start_date: "2021-03",
    end_date: "",
    location: "Lyon",
    description: "Back-end.",
    highlighted_skills: [],
  };

  it("rend titre, société, lieu, description et la période", () => {
    const { container } = render(
      <ExperienceEntry exp={{ ...base, end_date: "2023-06" }} t={t} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Développeur");
    expect(text).toContain("— ACME");
    expect(text).toContain("Lyon");
    expect(text).toContain("Back-end.");
    expect(text).toContain("mars 2021 — juin 2023"); // la période (annoncée dans le titre du test)
  });

  it("end_date vide ⇒ poste en cours (« aujourd'hui »)", () => {
    const { container } = render(<ExperienceEntry exp={base} t={t} />);
    expect(container.textContent).toContain("mars 2021 — aujourd'hui");
  });

  it("end_date renseignée ⇒ borne finale, pas « aujourd'hui »", () => {
    const { container } = render(
      <ExperienceEntry exp={{ ...base, end_date: "2023-06" }} t={t} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("mars 2021 — juin 2023");
    expect(text).not.toContain("aujourd'hui");
  });

  it("société absente ⇒ pas de « — » parasite dans le titre", () => {
    // Le « — » de la période (« mars 2021 — aujourd'hui ») vit dans un span
    // frère : on cible le <h3> (titre + société), seul porteur du « — société ».
    const { container } = render(
      <ExperienceEntry exp={{ ...base, company: "" }} t={t} />,
    );
    expect(container.querySelector("h3")?.textContent).toBe("Développeur");
  });

  it("rend le slot `skills` EN DERNIER enfant de l'entrée (position = personnalité)", () => {
    const { container } = render(
      <ExperienceEntry exp={base} t={t} skills={<i data-testid="slot" />} />,
    );
    const entry = container.firstElementChild;
    const slot = container.querySelector('[data-testid="slot"]');
    expect(slot).not.toBeNull();
    // Le slot doit être le dernier enfant (après description), comme l'inline d'origine.
    expect(entry?.lastElementChild).toBe(slot);
  });

  it("slot absent ⇒ aucun nœud parasite en fin d'entrée", () => {
    const { container } = render(<ExperienceEntry exp={base} t={t} />);
    const entry = container.firstElementChild;
    // Sans slot, le dernier enfant est la description (pas un nœud vide résiduel).
    expect(entry?.lastElementChild?.textContent).toBe("Back-end.");
  });
});

describe("ProjectEntry", () => {
  const proj = {
    id: "p1",
    name: "Observatoire",
    completion_date: "2022-06",
    description: "Open data.",
    relevant_skills: [],
  };

  it("rend nom, date d'achèvement, description et le slot `skills`", () => {
    const { container, getByTestId } = render(
      <ProjectEntry proj={proj} t={t} skills={<i data-testid="slot" />} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Observatoire");
    expect(text).toContain("juin 2022");
    expect(text).toContain("Open data.");
    expect(getByTestId("slot")).toBeTruthy();
  });
});

describe("EducationEntry", () => {
  it("rend diplôme, établissement, date et description", () => {
    const { container } = render(
      <EducationEntry
        edu={{
          id: "d1",
          degree: "Master",
          institution: "INSA Lyon",
          end_date: "2017-09",
          description: "Mention.",
        }}
        t={t}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Master");
    expect(text).toContain("INSA Lyon");
    expect(text).toContain("sept. 2017");
    expect(text).toContain("Mention.");
  });
});

describe("CertificationEntry", () => {
  const cert = {
    id: "c1",
    name: "PCA",
    issuer: "Google Cloud",
    issue_date: "2023-04",
  };

  it("rend nom, émetteur et date", () => {
    const { container } = render(<CertificationEntry cert={cert} t={t} />);
    const text = container.textContent ?? "";
    expect(text).toContain("PCA");
    expect(text).toContain("— Google Cloud");
    expect(text).toContain("avr. 2023");
  });

  it("émetteur absent ⇒ pas de « — » parasite", () => {
    const { container } = render(
      <CertificationEntry cert={{ ...cert, issuer: "" }} t={t} />,
    );
    expect(container.textContent).not.toContain("—");
  });
});
