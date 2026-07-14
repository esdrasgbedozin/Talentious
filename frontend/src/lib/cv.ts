/**
 * CV data normalization.
 *
 * The redacteur-cv agent emits the tailored CV content under enriched keys
 * (`selected_experiences`, `selected_educations`, `highlighted_skills`,
 * `selected_projects`, `selected_certifications`) that diverge from the canonical
 * ProfileData shape the renderer and editor consume. This adapter maps either shape
 * to canonical ProfileData so nothing is lost. When the canonical arrays are already
 * populated (e.g. a CV re-saved from the editor) they win — the adapter is idempotent.
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
    credential_url: str(c.credential_url),
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
