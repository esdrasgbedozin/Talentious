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
  const named = (skills ?? []).filter(
    (s): s is { name: string; category?: unknown } =>
      !!s && typeof s.name === "string" && s.name.length > 0,
  );
  return {
    hard: named.filter((s) => !isSoft(s.category)).map((s) => s.name),
    soft: named.filter((s) => isSoft(s.category)).map((s) => s.name),
  };
}

/**
 * View-model commun à TOUS les templates : identité, contacts, listes de
 * sections et compétences scindées, dérivés une seule fois du contenu canonique
 * + de la langue d'enveloppe. Les templates ne décrivent plus que leur
 * STRUCTURE visuelle à partir de cette vue (SRP) — le calcul des données n'est
 * plus dupliqué d'un template à l'autre. Aucun changement de valeur par rapport
 * au calcul inline historique de CVRenderer (snapshots inchangés).
 */
export function deriveCvView(
  cv: GeneratedCVData,
  language?: DocumentLanguage | null,
) {
  const t = getCVLocale(language);
  const p = cv.personal_info;
  const fullName = [p?.first_name, p?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const location = [p?.city, p?.country].filter(Boolean).join(", ");
  const contactBits = [p?.email, p?.phone, location, p?.linkedin].filter(
    Boolean,
  );
  const { hard: hardSkills, soft: softSkills } = splitSkills(
    cv.highlighted_skills,
  );
  return {
    t,
    fullName,
    location,
    contactBits,
    experiences: cv.selected_experiences ?? [],
    educations: cv.selected_educations ?? [],
    projects: cv.selected_projects ?? [],
    certifications: cv.selected_certifications ?? [],
    hardSkills,
    softSkills,
  };
}
