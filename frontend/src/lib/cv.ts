/**
 * PONT LEGACY V1 — lecture des CV stockés en ProfileData (M0-T08c).
 *
 * Depuis M0-T08c l'app parle GeneratedCVData de bout en bout (renderer, éditeur,
 * `PUT /cv`) : le SEUL usage restant de ce module est `toCanonicalCVData`,
 * appelé en lecture (getCV/updateCV) pour ponter un `cv_data_json` V1 legacy
 * (forme ProfileData) vers le canonique. `normalizeCVData` et
 * `profileToGeneratedCV` ne servent plus que ce pont (et ses tests) — ne pas
 * les réutiliser ailleurs. Résorption définitive après la décision backfill
 * des CV V1 (point d'arrêt PAH-M0).
 */
import {
  createEmptyProfile,
  type UserProfile,
  type Experience,
  type Education,
  type Project,
  type Certification,
  type Language,
} from '@/types/profile';
import type { components } from '@/generated/api';

type GeneratedCVData = components['schemas']['GeneratedCVData'];
type SelectedExperience = components['schemas']['SelectedExperience'];
type HighlightedSkill = components['schemas']['HighlightedSkill'];
type SelectedEducation = components['schemas']['SelectedEducation'];
type SelectedProject = components['schemas']['SelectedProject'];
type SelectedCertification = components['schemas']['SelectedCertification'];
type PersonalInfo = components['schemas']['PersonalInfo'];

type Raw = Record<string, unknown>;

function asArray(v: unknown): Raw[] {
  return Array.isArray(v) ? (v as Raw[]) : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function mapExperience(e: Raw): Experience {
  return {
    id: str(e.id) || crypto.randomUUID(),
    title: str(e.title),
    company: str(e.company),
    location: str(e.location),
    start_date: str(e.start_date),
    end_date: str(e.end_date),
    is_current: e.is_current === true || e.end_date == null || e.end_date === '',
    description: str(e.description),
    achievements: (asArray(e.achievements) as unknown as string[]).filter(
      (a) => typeof a === 'string',
    ),
  };
}

function mapEducation(e: Raw): Education {
  return {
    id: str(e.id) || crypto.randomUUID(),
    degree: str(e.degree),
    institution: str(e.institution),
    location: str(e.location),
    start_date: str(e.start_date),
    end_date: str(e.end_date),
    field: str(e.field),
    description: str(e.description),
    grade: str(e.grade),
  };
}

function mapProject(p: Raw): Project {
  return {
    id: str(p.id) || crypto.randomUUID(),
    name: str(p.name),
    description: str(p.description),
    url: str(p.url),
    start_date: str(p.start_date),
    // The agent uses `completion_date`; the canonical shape uses `end_date`.
    end_date: str(p.end_date) || str(p.completion_date),
    // The agent uses `relevant_skills`; the canonical shape uses `technologies`.
    technologies: (
      (asArray(p.technologies).length
        ? p.technologies
        : p.relevant_skills) as unknown as string[]
    )?.filter?.((t) => typeof t === 'string') ?? [],
    role: str(p.role),
  };
}

function mapCertification(c: Raw): Certification {
  return {
    id: str(c.id) || crypto.randomUUID(),
    name: str(c.name),
    issuer: str(c.issuer),
    issue_date: str(c.issue_date),
    expiration_date: str(c.expiration_date),
    credential_id: str(c.credential_id),
    // La forme canonique (SelectedCertification) porte `url` ; ProfileData porte
    // `credential_url`. Lire les deux évite de perdre l'URL au cycle lecture→save.
    credential_url: str(c.credential_url) || str(c.url),
  };
}

/** Split a flat highlighted_skills list ([{name, category}]) into {hard, soft}. */
function mapHighlightedSkills(list: Raw[]): { hard: string[]; soft: string[] } {
  const hard: string[] = [];
  const soft: string[] = [];
  for (const s of list) {
    const name = str(s.name);
    if (!name) continue;
    const category = str(s.category).toLowerCase();
    if (category.includes('soft')) soft.push(name);
    else hard.push(name);
  }
  return { hard, soft };
}

export function normalizeCVData(raw: unknown): UserProfile {
  const base = createEmptyProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Raw;

  const canonicalExp = asArray(r.experiences);
  const experiences = (canonicalExp.length ? canonicalExp : asArray(r.selected_experiences)).map(
    mapExperience,
  );

  const canonicalEdu = asArray(r.educations);
  const educations = (canonicalEdu.length ? canonicalEdu : asArray(r.selected_educations)).map(
    mapEducation,
  );

  const canonicalProj = asArray(r.projects);
  const projects = (canonicalProj.length ? canonicalProj : asArray(r.selected_projects)).map(
    mapProject,
  );

  const canonicalCert = asArray(r.certifications);
  const certifications = (
    canonicalCert.length ? canonicalCert : asArray(r.selected_certifications)
  ).map(mapCertification);

  // Skills: prefer canonical {hard, soft}; else derive from the flat highlighted list.
  const rawSkills = (r.skills as Raw) || {};
  const canonicalHard = (asArray(rawSkills.hard) as unknown as string[]).filter(
    (s) => typeof s === 'string',
  );
  const canonicalSoft = (asArray(rawSkills.soft) as unknown as string[]).filter(
    (s) => typeof s === 'string',
  );
  const skills =
    canonicalHard.length || canonicalSoft.length
      ? { hard: canonicalHard, soft: canonicalSoft }
      : mapHighlightedSkills(asArray(r.highlighted_skills));

  const languages = (asArray(r.languages) as unknown as Language[]).filter(
    (l) => l && typeof l === 'object',
  );

  return {
    ...base,
    personal_info: { ...base.personal_info, ...((r.personal_info as object) || {}) },
    summary: str(r.summary),
    experiences,
    educations,
    skills,
    languages,
    projects,
    certifications,
  };
}

// ===========================================================================
// ProfileData -> GeneratedCVData (sens INVERSE de normalizeCVData) — seconde
// moitié du pont legacy : un CV V1 (forme ProfileData) est normalisé puis
// reconverti en canonique à la LECTURE (toCanonicalCVData). On préserve tout ce
// que le canonique sait porter ; le contenu non modélisé (`achievements`) est
// plié dans `description`, le reste (`languages`, formation
// `field/grade/location/start_date`, projet `role/start_date`, certification
// `expiration_date/credential_id`) est perdu au passage du pont — population
// concernée et backfill arbitrés à PAH-M0.
// ===========================================================================

function optStr(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

/** URL optionnelle : préfixe https:// quand le schéma manque (le backend rejette
 * en silence toute URL non http(s) — ex. `linkedin.com/in/x` saisi sans schéma). */
function optUrl(v: unknown): string | null {
  const s = optStr(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Replie une liste d'accomplissements en puces à la fin de la description. */
function foldAchievements(description: string, achievements: unknown): string {
  const items = Array.isArray(achievements) ? achievements.filter(isNonEmptyStr) : [];
  if (items.length === 0) return description;
  const bullets = items.map((a) => `• ${a}`).join('\n');
  return description ? `${description}\n${bullets}` : bullets;
}

export function profileToGeneratedCV(profile: UserProfile): GeneratedCVData {
  const p = (profile ?? {}) as Partial<UserProfile>;

  // Liste blanche explicite (pas de spread) : aucune clé parasite ne transite,
  // et le linkedin sans schéma est réparé avant la re-validation backend.
  const pi = (p.personal_info ?? {}) as Partial<PersonalInfo>;
  const personal_info: PersonalInfo = {
    first_name: str(pi.first_name),
    last_name: str(pi.last_name),
    email: str(pi.email),
    phone: optStr(pi.phone),
    linkedin: optUrl(pi.linkedin),
    address: optStr(pi.address),
    city: optStr(pi.city),
    postal_code: optStr(pi.postal_code),
    country: optStr(pi.country),
  };

  const experiences = (p.experiences ?? []) as Experience[];
  const selected_experiences: SelectedExperience[] = experiences.map((e, i) => ({
    id: str(e.id) || `exp-${i + 1}`,
    title: str(e.title),
    company: str(e.company),
    location: optStr(e.location),
    start_date: str(e.start_date),
    // Le canonique n'a pas `is_current` : un poste en cours = `end_date` null.
    end_date: e.is_current ? null : optStr(e.end_date),
    description: foldAchievements(str(e.description), e.achievements),
    // ProfileData ne porte pas de compétences par expérience.
    highlighted_skills: [],
  }));

  const toHighlighted = (
    names: string[] | undefined,
    category: 'hard_skill' | 'soft_skill',
  ): HighlightedSkill[] =>
    (names ?? []).filter(isNonEmptyStr).map((name) => ({
      name,
      level: null,
      category,
      importance: 'Important' as const,
    }));

  const skills = (p.skills ?? { hard: [], soft: [] }) as { hard?: string[]; soft?: string[] };
  const highlighted_skills: HighlightedSkill[] = [
    ...toHighlighted(skills.hard, 'hard_skill'),
    ...toHighlighted(skills.soft, 'soft_skill'),
  ];

  const educations = (p.educations ?? []) as Education[];
  const selected_educations: SelectedEducation[] = educations.map((e, i) => ({
    id: str(e.id) || `edu-${i + 1}`,
    degree: str(e.degree),
    institution: str(e.institution),
    end_date: optStr(e.end_date),
    description: optStr(e.description),
  }));

  const projects = (p.projects ?? []) as Project[];
  const selected_projects: SelectedProject[] = projects.map((pr, i) => ({
    id: str(pr.id) || `proj-${i + 1}`,
    name: str(pr.name),
    description: str(pr.description),
    url: optUrl(pr.url),
    // Le canonique utilise `completion_date` là où ProfileData a `end_date`.
    completion_date: optStr(pr.end_date),
    relevant_skills: (pr.technologies ?? []).filter(isNonEmptyStr),
  }));

  const certifications = (p.certifications ?? []) as Certification[];
  const selected_certifications: SelectedCertification[] = certifications.map((c, i) => ({
    id: str(c.id) || `cert-${i + 1}`,
    name: str(c.name),
    issuer: str(c.issuer),
    issue_date: optStr(c.issue_date),
    url: optUrl(c.credential_url),
  }));

  return {
    personal_info,
    summary: str(p.summary),
    selected_experiences,
    highlighted_skills,
    selected_educations,
    selected_projects,
    selected_certifications,
    // `optimization_notes` volontairement absent (jamais produit côté app).
  };
}

/**
 * `cv_data_json` tel que stocké → GeneratedCVData canonique pour le renderer.
 *
 * Passthrough STRICT quand le contenu est déjà canonique (zéro transformation,
 * ADR-CONTENT-SCHEMA — préserve notamment les `highlighted_skills` par
 * expérience produits par l'agent, que `normalizeCVData` ne modélise pas).
 * Un CV V1 legacy (forme ProfileData) est ponté via normalisation + conversion ;
 * ce pont disparaît avec la décision backfill des CV V1 (PAH-M0).
 */
export function toCanonicalCVData(raw: unknown): GeneratedCVData {
  if (raw && typeof raw === 'object' && 'selected_experiences' in raw) {
    return raw as GeneratedCVData;
  }
  return profileToGeneratedCV(normalizeCVData(raw));
}

