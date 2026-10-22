/**
 * Logique pure de l'éditeur de CV CANONIQUE (M0-T08c).
 *
 * L'éditeur travaille directement sur `GeneratedCVData` (ADR-CONTENT-SCHEMA) :
 * ce module porte tout ce qui n'est pas du JSX — fabriques de cartes vides,
 * mise en forme défensive au chargement (CV V1 bruts stockés avant la ceinture
 * de coercition), édition de la liste plate de compétences sans perdre
 * `level`/`importance`, normalisation au save et validation anti-perte
 * silencieuse (parité M0-T08a). Aucun pont ProfileData ici.
 */
import { generateId } from '@/types/profile';
import type { components } from '@/generated/api';

type GeneratedCVData = components['schemas']['GeneratedCVData'];
type SelectedExperience = components['schemas']['SelectedExperience'];
type HighlightedSkill = components['schemas']['HighlightedSkill'];
type SelectedEducation = components['schemas']['SelectedEducation'];
type SelectedProject = components['schemas']['SelectedProject'];
type SelectedCertification = components['schemas']['SelectedCertification'];
type SkillCategory = HighlightedSkill['category'];

/** Plafond backend (`MAX_LIST_ITEMS`) commun à TOUTES les listes du contenu :
 * au-delà, les éléments excédentaires sont tronqués en silence par la coercition. */
export const CV_SAVE_MAX_LIST_ITEMS = 30;

/** Alias lisible pour la liste plate de compétences (même plafond backend). */
export const CV_SAVE_MAX_SKILLS = CV_SAVE_MAX_LIST_ITEMS;

// ---------------------------------------------------------------------------
// Fabriques — cartes vides ajoutées par l'utilisateur.
// ---------------------------------------------------------------------------

export function createEmptyCVExperience(): SelectedExperience {
  return {
    id: generateId(),
    title: '',
    company: '',
    location: null,
    start_date: '',
    // '' = « terminé, date à renseigner » (bloqué au save) ; null = poste actuel.
    end_date: '',
    description: '',
    highlighted_skills: [],
  };
}

export function createEmptyCVEducation(): SelectedEducation {
  return { id: generateId(), degree: '', institution: '', end_date: null, description: null };
}

export function createEmptyCVProject(): SelectedProject {
  return {
    id: generateId(),
    name: '',
    description: '',
    url: null,
    completion_date: null,
    relevant_skills: [],
  };
}

export function createEmptyCVCertification(): SelectedCertification {
  return { id: generateId(), name: '', issuer: '', issue_date: null, url: null };
}

export function createEmptyCVData(): GeneratedCVData {
  return {
    personal_info: {
      first_name: '',
      last_name: '',
      email: '',
      phone: null,
      linkedin: null,
      address: null,
      city: null,
      postal_code: null,
      country: null,
    },
    summary: '',
    selected_experiences: [],
    highlighted_skills: [],
    selected_educations: [],
    selected_projects: [],
    selected_certifications: [],
  };
}

// ---------------------------------------------------------------------------
// Chargement — mise en forme défensive des CV V1 bruts (stockés avant la
// ceinture de coercition) vers ce que le backend STOCKERAIT : listes absentes
// complétées, ids garantis uniques (sinon éditer une carte modifie ses
// jumelles), champs requis non-chaînes remis à '', `end_date` '' → null (le
// backend relit '' comme « poste en cours » — sans quoi la case « Poste
// actuel » se décoche au chargement, revue T08c B2), catégories libres V1
// (« Soft Skill ») canonicalisées à l'enum du contrat (sans quoi la coercition
// les rabat sur hard_skill au save, revue T08c B1). Un canonique propre
// traverse à l'identique (testé). Les valeurs invalides restantes (ex. date
// non-mois) sont laissées telles quelles : c'est `validateCVForSave` qui les
// bloque explicitement.
// ---------------------------------------------------------------------------

function asList<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function reqStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Garantit un id non vide et unique au sein de sa liste. */
function makeEnsureId(): (v: unknown) => string {
  const seen = new Set<string>();
  return (v: unknown) => {
    let id = typeof v === 'string' && v.trim() !== '' ? v : generateId();
    while (seen.has(id)) id = generateId();
    seen.add(id);
    return id;
  };
}

function canonicalCategory(category: unknown): HighlightedSkill['category'] {
  return isSoftCategory(category) ? 'soft_skill' : 'hard_skill';
}

export function ensureCVShape(raw: unknown): GeneratedCVData {
  const base = createEmptyCVData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const expId = makeEnsureId();
  const eduId = makeEnsureId();
  const projId = makeEnsureId();
  const certId = makeEnsureId();
  return {
    personal_info: {
      ...base.personal_info,
      ...((r.personal_info as object) ?? {}),
    },
    summary: reqStr(r.summary),
    selected_experiences: asList<SelectedExperience>(r.selected_experiences).map((e) => ({
      ...e,
      id: expId(e?.id),
      title: reqStr(e?.title),
      company: reqStr(e?.company),
      start_date: reqStr(e?.start_date),
      end_date: e?.end_date === '' ? null : e?.end_date,
      description: reqStr(e?.description),
      highlighted_skills: asList<string>(e?.highlighted_skills),
    })),
    highlighted_skills: asList<HighlightedSkill>(r.highlighted_skills)
      .filter((s) => s && typeof s.name === 'string' && s.name !== '')
      .map((s) => ({ ...s, category: canonicalCategory(s.category) })),
    selected_educations: asList<SelectedEducation>(r.selected_educations).map((e) => ({
      ...e,
      id: eduId(e?.id),
      degree: reqStr(e?.degree),
      institution: reqStr(e?.institution),
    })),
    selected_projects: asList<SelectedProject>(r.selected_projects).map((p) => ({
      ...p,
      id: projId(p?.id),
      name: reqStr(p?.name),
      description: reqStr(p?.description),
      relevant_skills: asList<string>(p?.relevant_skills),
    })),
    selected_certifications: asList<SelectedCertification>(r.selected_certifications).map((c) => ({
      ...c,
      id: certId(c?.id),
      name: reqStr(c?.name),
      issuer: reqStr(c?.issuer),
    })),
  };
}

// ---------------------------------------------------------------------------
// Compétences plates — l'UI édite des listes de noms (champ à tags) ; les
// métadonnées `level`/`importance` (et la catégorie brute d'un CV V1) des
// compétences conservées sont préservées par nom.
// ---------------------------------------------------------------------------

/** Tolérance aux catégories libres des CV V1 bruts (« Soft Skill ») — même
 * heuristique que le renderer : tout ce qui contient « soft » est soft. */
function isSoftCategory(category: unknown): boolean {
  return typeof category === 'string' && category.toLowerCase().includes('soft');
}

function inCategory(skill: HighlightedSkill, category: SkillCategory): boolean {
  return isSoftCategory(skill.category) === (category === 'soft_skill');
}

export function skillNames(skills: HighlightedSkill[], category: SkillCategory): string[] {
  return skills
    .filter((s) => s && typeof s.name === 'string' && s.name && inCategory(s, category))
    .map((s) => s.name);
}

export function withSkillNames(
  skills: HighlightedSkill[],
  names: string[],
  category: SkillCategory,
): HighlightedSkill[] {
  const others = skills.filter((s) => !inCategory(s, category));
  const existing = new Map(
    skills.filter((s) => inCategory(s, category)).map((s) => [s.name, s]),
  );
  const rebuilt = names
    .filter((n) => typeof n === 'string' && n.trim() !== '')
    .map(
      (name) =>
        existing.get(name) ?? { name, level: null, category, importance: 'Important' as const },
    );
  // Convention d'ordre du document : techniques d'abord, transversales ensuite.
  return category === 'hard_skill' ? [...rebuilt, ...others] : [...others, ...rebuilt];
}

// ---------------------------------------------------------------------------
// Save — normalisation du payload PUT. Identité sur un canonique propre :
// seuls les brouillons vides, les optionnels vides ('' → null), les URLs sans
// schéma (préfixe https://, le backend rejette en silence toute URL non
// http(s)) et `optimization_notes` (jamais renvoyé, BLK-5) sont touchés.
// ---------------------------------------------------------------------------

function optStr(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

function optUrl(v: unknown): string | null {
  const s = optStr(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

// Une carte n'est « vide » (écartable sans dommage) que si TOUT y est vide,
// dates/localisation/URL comprises : une carte remplie seulement d'une date
// doit être bloquée par la validation, pas écartée en silence (revue T08c, C3).
const isEmptyExperience = (e: SelectedExperience): boolean =>
  !isNonEmptyStr(e.title) &&
  !isNonEmptyStr(e.company) &&
  !isNonEmptyStr(e.description) &&
  !isNonEmptyStr(e.location) &&
  !isNonEmptyStr(e.start_date) &&
  !isNonEmptyStr(e.end_date) &&
  e.highlighted_skills.every((s) => !isNonEmptyStr(s));

const isEmptyEducation = (e: SelectedEducation): boolean =>
  !isNonEmptyStr(e.degree) &&
  !isNonEmptyStr(e.institution) &&
  !isNonEmptyStr(e.description) &&
  !isNonEmptyStr(e.end_date);

const isEmptyProject = (p: SelectedProject): boolean =>
  !isNonEmptyStr(p.name) &&
  !isNonEmptyStr(p.description) &&
  !isNonEmptyStr(p.url) &&
  !isNonEmptyStr(p.completion_date) &&
  p.relevant_skills.every((s) => !isNonEmptyStr(s));

const isEmptyCertification = (c: SelectedCertification): boolean =>
  !isNonEmptyStr(c.name) &&
  !isNonEmptyStr(c.issuer) &&
  !isNonEmptyStr(c.issue_date) &&
  !isNonEmptyStr(c.url);

/** Dédoublonne une liste de compétences sans tenir compte de la casse (le
 * backend le ferait en silence — revue T08c, C5) ; la première graphie gagne. */
function dedupeSkills(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sanitizeCVForSave(cv: GeneratedCVData): GeneratedCVData {
  return {
    personal_info: {
      ...cv.personal_info,
      phone: optStr(cv.personal_info.phone),
      linkedin: optUrl(cv.personal_info.linkedin),
      address: optStr(cv.personal_info.address),
      city: optStr(cv.personal_info.city),
      postal_code: optStr(cv.personal_info.postal_code),
      country: optStr(cv.personal_info.country),
    },
    summary: cv.summary,
    selected_experiences: cv.selected_experiences
      .filter((e) => !isEmptyExperience(e))
      .map((e) => ({
        ...e,
        location: optStr(e.location),
        highlighted_skills: dedupeSkills(e.highlighted_skills.filter(isNonEmptyStr)),
      })),
    highlighted_skills: cv.highlighted_skills,
    selected_educations: cv.selected_educations
      .filter((e) => !isEmptyEducation(e))
      .map((e) => ({ ...e, end_date: optStr(e.end_date), description: optStr(e.description) })),
    selected_projects: cv.selected_projects
      .filter((p) => !isEmptyProject(p))
      .map((p) => ({
        ...p,
        url: optUrl(p.url),
        completion_date: optStr(p.completion_date),
        relevant_skills: dedupeSkills(p.relevant_skills.filter(isNonEmptyStr)),
      })),
    selected_certifications: cv.selected_certifications
      .filter((c) => !isEmptyCertification(c))
      .map((c) => ({ ...c, issue_date: optStr(c.issue_date), url: optUrl(c.url) })),
    // `optimization_notes` volontairement absent (BLK-5 : jamais renvoyé).
  };
}

// ---------------------------------------------------------------------------
// Validation avant save (parité M0-T08a, version canonique) : la coercition
// backend ÉCARTE en silence toute expérience sans date AAAA-MM et tronque les
// listes au-delà du plafond. On bloque avec un message explicite plutôt que de
// laisser « CV enregistré » masquer une disparition.
// ---------------------------------------------------------------------------

const MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

function isMonth(v: unknown): boolean {
  return typeof v === 'string' && MONTH_RE.test(v.trim());
}

/** Problèmes qui causeraient une perte silencieuse au save ; [] si tout est sûr. */
export function validateCVForSave(cv: GeneratedCVData): string[] {
  const problems: string[] = [];

  for (const e of cv.selected_experiences) {
    if (isEmptyExperience(e)) continue; // brouillon vide : écarté sans dommage
    // Libellé sûr même sur un V1 brut hostile (title non-chaîne ou blanc).
    const label = [e.title, e.company].find(isNonEmptyStr)?.trim() ?? '';
    if (!label) {
      problems.push(
        'Une expérience doit avoir un titre ou une entreprise pour être enregistrée.',
      );
      continue;
    }
    if (!isMonth(e.start_date)) {
      problems.push(
        `L'expérience « ${label} » doit avoir une date de début (AAAA-MM) pour être enregistrée.`,
      );
    } else if (e.end_date != null && !isMonth(e.end_date)) {
      // null = poste actuel ; toute autre valeur doit être un mois valide,
      // sinon le backend la relit comme « poste en cours ».
      problems.push(
        `L'expérience « ${label} » est marquée terminée : renseignez sa date de fin (AAAA-MM) ou cochez « Poste actuel ».`,
      );
    }
    if (e.highlighted_skills.filter(isNonEmptyStr).length > CV_SAVE_MAX_LIST_ITEMS) {
      problems.push(
        `L'expérience « ${label} » : au plus ${CV_SAVE_MAX_LIST_ITEMS} compétences mises en avant peuvent être enregistrées.`,
      );
    }
  }

  // Parité avec les règles d'éviction backend (revue T08c, C3) : toute carte
  // avec du contenu mais sans son champ pivot serait écartée en silence.
  for (const edu of cv.selected_educations) {
    if (isEmptyEducation(edu)) continue;
    if (!isNonEmptyStr(edu.degree) && !isNonEmptyStr(edu.institution)) {
      problems.push(
        'Une formation doit avoir un diplôme ou un établissement pour être enregistrée.',
      );
    }
  }
  for (const proj of cv.selected_projects) {
    if (isEmptyProject(proj)) continue;
    if (!isNonEmptyStr(proj.name)) {
      problems.push('Un projet doit avoir un nom pour être enregistré.');
    } else if (proj.relevant_skills.filter(isNonEmptyStr).length > CV_SAVE_MAX_LIST_ITEMS) {
      problems.push(
        `Le projet « ${proj.name.trim()} » : au plus ${CV_SAVE_MAX_LIST_ITEMS} compétences peuvent être enregistrées.`,
      );
    }
  }
  for (const cert of cv.selected_certifications) {
    if (isEmptyCertification(cert)) continue;
    if (!isNonEmptyStr(cert.name)) {
      problems.push('Une certification doit avoir un nom pour être enregistrée.');
    }
  }

  // Plafond backend par liste : au-delà, les éléments excédentaires sont
  // tronqués en silence (et comme l'ajout PRÉPEND, c'est la plus ancienne
  // carte qui disparaîtrait).
  const listCaps: Array<[string, number]> = [
    ['expériences', cv.selected_experiences.filter((e) => !isEmptyExperience(e)).length],
    ['formations', cv.selected_educations.filter((e) => !isEmptyEducation(e)).length],
    ['projets', cv.selected_projects.filter((p) => !isEmptyProject(p)).length],
    ['certifications', cv.selected_certifications.filter((c) => !isEmptyCertification(c)).length],
  ];
  for (const [name, count] of listCaps) {
    if (count > CV_SAVE_MAX_LIST_ITEMS) {
      problems.push(
        `Au plus ${CV_SAVE_MAX_LIST_ITEMS} ${name} peuvent être enregistrées — ${count} saisies.`,
      );
    }
  }

  if (cv.highlighted_skills.length > CV_SAVE_MAX_SKILLS) {
    problems.push(
      `Au plus ${CV_SAVE_MAX_SKILLS} compétences (techniques + transversales) peuvent être enregistrées — ${cv.highlighted_skills.length} saisies.`,
    );
  }

  return problems;
}
