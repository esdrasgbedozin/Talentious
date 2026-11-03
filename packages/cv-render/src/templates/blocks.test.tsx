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

  it("insère un séparateur ENTRE les items seulement (n−1), jamais en tête ni en queue", () => {
    const { container } = render(
      <ContactLine
        bits={["a@ex.com", "+33", "Lyon"]}
        className="text-[11px]"
      />,
    );
    // Séquence EXACTE : verrouille l'ordre ET le n−1 (un « • » en tête/queue ou
    // un item réordonné ferait échouer), là où un simple comptage ne le ferait pas.
    expect(container.textContent).toBe("a@ex.com•+33•Lyon");
    // La classe passée est bien portée par le paragraphe (personnalité du template).
    expect(container.querySelector("p")?.className).toContain("text-[11px]");
  });

  it("un seul item ⇒ aucun séparateur", () => {
    const { container } = render(
      <ContactLine bits={["solo@ex.com"]} className="x" />,
    );
    expect(container.textContent).toBe("solo@ex.com");
  });

  it("séparateur personnalisable (tech utilise « / »)", () => {
    const { container } = render(
      <ContactLine bits={["a", "b"]} className="x" separator="/" />,
    );
    expect(container.textContent).toContain("/");
    expect(container.textContent).not.toContain("•");
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

  it("classe par défaut « mt-1 », surchargeable (modern utilise « mt-0.5 »)", () => {
    expect(
      render(<InlineSkills skills={["x"]} />).container.querySelector("p")
        ?.className,
    ).toContain("mt-1");
    expect(
      render(
        <InlineSkills skills={["x"]} className="mt-0.5 text-[10px]" />,
      ).container.querySelector("p")?.className,
    ).toContain("mt-0.5");
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
