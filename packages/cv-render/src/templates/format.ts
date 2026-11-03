/**
 * Logique PARTAGÉE par les templates (M3-T01) — extraite de CVRenderer sans
 * changement de comportement : formatage des dates (`YYYY-MM[-DD]` → « mois
 * année » dans la locale), scission des compétences, et dérivation du
 * view-model commun (identité, contacts, listes). Fonctions pures, verrouillées
 * par format.test.ts et les snapshots de chaque template.
 */
import type { GeneratedCVData } from "../types";
import { getCVLocale, type CVLocale, type DocumentLanguage } from "../i18n";

/** "2020-03" | "2020-03-15" → "mars 2020" / "Mar 2020" selon la locale ; "" → "". */
export function formatMonthYear(t: CVLocale, value?: string | null): string {
  // Document corrompu (non-chaîne) : ne jamais renvoyer un objet comme enfant
  // React — le rendu Chromium (M2) d'un document ne doit pas pouvoir planter.
  if (!value || typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${t.months[idx]} ${year}` : year;
}

export function dateRange(
  t: CVLocale,
  start?: string | null,
  end?: string | null,
  isCurrent?: boolean,
): string {
  const from = formatMonthYear(t, start);
  const to = isCurrent ? t.present : formatMonthYear(t, end);
  if (from && to) return `${from} — ${to}`;
  return from || to || "";
}

/** Scinde la liste plate `highlighted_skills` (catégorisée) en techniques /
 * transversales. Tolérance défensive (defense in depth) : les CV V1 stockés
 * AVANT la ceinture de coercition portent des catégories libres (« Hard Skill »,
 * « technical »…) — on scinde sur « soft » (insensible à la casse), tout le reste
 * est technique, comme l'ancien normalizeCVData. L'enum canonique satisfait
 * trivialement ce test. */
export function splitSkills(
  skills:
    | ReadonlyArray<{ name?: unknown; category?: unknown } | null | undefined>
    | null
    | undefined,
): { hard: string[]; soft: string[] } {
  const isSoft = (category: unknown) =>
    typeof category === "string" && category.toLowerCase().includes("soft");
  // Garde non-tableau (défense en profondeur) : un `highlighted_skills` corrompu
  // en chaîne/objet ne doit pas faire planter `.filter` (rendu Chromium serveur).
  const named = (Array.isArray(skills) ? skills : []).filter(
    (s): s is { name: string; category?: unknown } =>
      !!s && typeof s.name === "string" && s.name.length > 0,
  );
  return {
    hard: named.filter((s) => !isSoft(s.category)).map((s) => s.name),
    soft: named.filter((s) => isSoft(s.category)).map((s) => s.name),
  };
}

/**
 * Coercition `string` d'un champ de contenu (défense en profondeur). Le contrat
 * type ces champs en `string` et une ceinture de coercition s'applique avant
 * stockage, MAIS le rendu alimente un Chromium serveur : un document corrompu
 * (champ en objet/tableau) ne doit JAMAIS faire planter `renderToStaticMarkup`
 * (`x.trim()` sur un non-string, ou un objet passé comme enfant React). On
 * normalise donc tout champ texte au seuil du view-model, une seule fois, au
 * lieu de répliquer la garde (ou de l'omettre) dans chaque template — cohérent
 * avec la garde déjà posée sur les dates (`formatMonthYear`). `""` et `undefined`
 * restent falsy : les rendus conditionnels des templates sont inchangés. */
export function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Coercition d'une liste de compétences en `string[]` sûr : non-tableau → `[]`,
 * éléments non-string ou vides écartés (évite `.filter`/`.join` sur un corpus
 * corrompu, et un `[object Object]` rendu). */
export function asTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
}

/** Entrée d'expérience normalisée (tous champs texte garantis `string`). */
export interface CvExperienceView {
  id?: string | number | null;
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  location: string;
  description: string;
  highlighted_skills: string[];
}
export interface CvEducationView {
  id?: string | number | null;
  degree: string;
  institution: string;
  end_date: string;
  description: string;
}
export interface CvProjectView {
  id?: string | number | null;
  name: string;
  completion_date: string;
  description: string;
  relevant_skills: string[];
}
export interface CvCertificationView {
  id?: string | number | null;
  name: string;
  issuer: string;
  issue_date: string;
}

/** Entrées de liste potentiellement nulles/corrompues → objets normalisés ;
 * les éléments non-objet sont écartés (jamais `null.title`). */
function entries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (e): e is Record<string, unknown> => !!e && typeof e === "object",
      )
    : [];
}

/**
 * View-model commun à TOUS les templates : identité, contacts, listes de
 * sections et compétences scindées, dérivés une seule fois du contenu canonique
 * + de la langue d'enveloppe. Les templates ne décrivent plus que leur
 * STRUCTURE visuelle à partir de cette vue (SRP) — le calcul des données n'est
 * plus dupliqué d'un template à l'autre, et tout champ texte est normalisé ici
 * (défense en profondeur, cf. `asText`/`asTextList`). Aucun changement de valeur
 * pour un document valide (champs déjà `string`) : snapshots inchangés.
 */
export function deriveCvView(
  cv: GeneratedCVData,
  language?: DocumentLanguage | null,
) {
  const t = getCVLocale(language);
  const p = cv.personal_info;
  const firstName = asText(p?.first_name).trim();
  const lastName = asText(p?.last_name).trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const location = [asText(p?.city), asText(p?.country)]
    .filter(Boolean)
    .join(", ");
  const contactBits = [
    asText(p?.email),
    asText(p?.phone),
    location,
    asText(p?.linkedin),
  ].filter(Boolean);
  const { hard: hardSkills, soft: softSkills } = splitSkills(
    cv.highlighted_skills,
  );
  const experiences: CvExperienceView[] = entries(cv.selected_experiences).map(
    (e) => ({
      id: e.id as string | number | null | undefined,
      title: asText(e.title),
      company: asText(e.company),
      start_date: asText(e.start_date),
      end_date: asText(e.end_date),
      location: asText(e.location),
      description: asText(e.description),
      highlighted_skills: asTextList(e.highlighted_skills),
    }),
  );
  const educations: CvEducationView[] = entries(cv.selected_educations).map(
    (e) => ({
      id: e.id as string | number | null | undefined,
      degree: asText(e.degree),
      institution: asText(e.institution),
      end_date: asText(e.end_date),
      description: asText(e.description),
    }),
  );
  const projects: CvProjectView[] = entries(cv.selected_projects).map((e) => ({
    id: e.id as string | number | null | undefined,
    name: asText(e.name),
    completion_date: asText(e.completion_date),
    description: asText(e.description),
    relevant_skills: asTextList(e.relevant_skills),
  }));
  const certifications: CvCertificationView[] = entries(
    cv.selected_certifications,
  ).map((e) => ({
    id: e.id as string | number | null | undefined,
    name: asText(e.name),
    issuer: asText(e.issuer),
    issue_date: asText(e.issue_date),
  }));
  return {
    t,
    firstName,
    lastName,
    fullName,
    summary: asText(cv.summary),
    location,
    contactBits,
    experiences,
    educations,
    projects,
    certifications,
    hardSkills,
    softSkills,
  };
}
