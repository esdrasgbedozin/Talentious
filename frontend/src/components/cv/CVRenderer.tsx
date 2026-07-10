/**
 * CVRenderer — renders a ProfileData (cv_data_json) as a clean, ATS-friendly,
 * print-optimized A4 CV. Used both for the live preview in the editor and for the
 * print/PDF route. Purely presentational: no data fetching, no side effects.
 *
 * Empty sections are skipped so partial CVs still render cleanly.
 */
import type { UserProfile } from '@/types/profile';

interface CVRendererProps {
  profile: UserProfile;
}

/** "2020-03" | "2020-03-15" → "mars 2020"; "" → "". */
function formatMonthYear(value?: string | null): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const months = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ];
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${months[idx]} ${year}` : year;
}

function dateRange(start?: string | null, end?: string | null, isCurrent?: boolean): string {
  const from = formatMonthYear(start);
  const to = isCurrent ? "aujourd'hui" : formatMonthYear(end);
  if (from && to) return `${from} — ${to}`;
  return from || to || '';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-border pb-1 text-[13px] font-bold uppercase tracking-wide text-action">
      {children}
    </h2>
  );
}

export default function CVRenderer({ profile }: CVRendererProps) {
  const p = profile.personal_info;
  const fullName = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
  const location = [p?.city, p?.country].filter(Boolean).join(', ');
  const contactBits = [p?.email, p?.phone, location, p?.linkedin].filter(Boolean);

  const experiences = profile.experiences ?? [];
  const educations = profile.educations ?? [];
  const projects = profile.projects ?? [];
  const certifications = profile.certifications ?? [];
  const languages = profile.languages ?? [];
  const hardSkills = profile.skills?.hard ?? [];
  const softSkills = profile.skills?.soft ?? [];

  return (
    <article className="cv-sheet mx-auto w-full max-w-[210mm] bg-white px-[16mm] py-[14mm] text-[11px] leading-relaxed text-text-primary">
      {/* Header */}
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          {fullName || 'Votre nom'}
        </h1>
        {contactBits.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-secondary">
            {contactBits.map((bit, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-border">•</span>}
                {bit}
              </span>
            ))}
          </p>
        )}
      </header>

      {/* Summary */}
      {profile.summary?.trim() && (
        <section className="mb-5">
          <SectionTitle>Profil</SectionTitle>
          <p className="whitespace-pre-line text-text-primary">{profile.summary}</p>
        </section>
      )}

      {/* Experiences */}
      {experiences.length > 0 && (
        <section className="mb-5">
          <SectionTitle>Expérience professionnelle</SectionTitle>
          <div className="space-y-3">
            {experiences.map((exp, i) => (
              <div key={exp.id ?? i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-text-primary">
                    {exp.title}
                    {exp.company && (
                      <span className="font-normal text-text-secondary"> — {exp.company}</span>
                    )}
                  </h3>
                  <span className="flex-shrink-0 text-[10px] text-text-secondary">
                    {dateRange(exp.start_date, exp.end_date, exp.is_current)}
                  </span>
                </div>
                {exp.location && (
                  <p className="text-[10px] italic text-text-secondary">{exp.location}</p>
                )}
                {exp.description && (
                  <p className="mt-1 whitespace-pre-line text-text-primary">{exp.description}</p>
                )}
                {Array.isArray(exp.achievements) && exp.achievements.filter(Boolean).length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-primary marker:text-action">
                    {exp.achievements.filter(Boolean).map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {educations.length > 0 && (
        <section className="mb-5">
          <SectionTitle>Formation</SectionTitle>
          <div className="space-y-2">
            {educations.map((edu, i) => (
              <div key={edu.id ?? i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-text-primary">
                    {edu.degree}
                    {edu.field && (
                      <span className="font-normal text-text-secondary"> · {edu.field}</span>
                    )}
                  </h3>
                  <span className="flex-shrink-0 text-[10px] text-text-secondary">
                    {dateRange(edu.start_date, edu.end_date)}
                  </span>
                </div>
                <p className="text-[10px] text-text-secondary">
                  {[edu.institution, edu.location, edu.grade].filter(Boolean).join(' · ')}
                </p>
                {edu.description && (
                  <p className="mt-0.5 whitespace-pre-line text-text-primary">{edu.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills */}
      {(hardSkills.length > 0 || softSkills.length > 0) && (
        <section className="mb-5 break-inside-avoid">
          <SectionTitle>Compétences</SectionTitle>
          {hardSkills.length > 0 && (
            <div className="mb-1.5">
              <span className="font-semibold text-text-primary">Techniques : </span>
              <SkillChips skills={hardSkills} />
            </div>
          )}
          {softSkills.length > 0 && (
            <div>
              <span className="font-semibold text-text-primary">Transversales : </span>
              <SkillChips skills={softSkills} />
            </div>
          )}
        </section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="mb-5">
          <SectionTitle>Projets</SectionTitle>
          <div className="space-y-2">
            {projects.map((proj, i) => (
              <div key={proj.id ?? i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-text-primary">
                    {proj.name}
                    {proj.role && (
                      <span className="font-normal text-text-secondary"> — {proj.role}</span>
                    )}
                  </h3>
                  <span className="flex-shrink-0 text-[10px] text-text-secondary">
                    {dateRange(proj.start_date, proj.end_date)}
                  </span>
                </div>
                {proj.description && (
                  <p className="mt-0.5 whitespace-pre-line text-text-primary">{proj.description}</p>
                )}
                {Array.isArray(proj.technologies) && proj.technologies.filter(Boolean).length > 0 && (
                  <p className="mt-0.5 text-[10px] text-text-secondary">
                    {proj.technologies.filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <SectionTitle>Certifications</SectionTitle>
          <div className="space-y-1">
            {certifications.map((cert, i) => (
              <div key={cert.id ?? i} className="flex items-baseline justify-between gap-3">
                <span className="text-text-primary">
                  <span className="font-semibold">{cert.name}</span>
                  {cert.issuer && (
                    <span className="text-text-secondary"> — {cert.issuer}</span>
                  )}
                </span>
                <span className="flex-shrink-0 text-[10px] text-text-secondary">
                  {formatMonthYear(cert.issue_date)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Languages */}
      {languages.length > 0 && (
        <section className="break-inside-avoid">
          <SectionTitle>Langues</SectionTitle>
          <p className="text-text-primary">
            {languages
              .filter((l) => l.name)
              .map((l) => (l.level ? `${l.name} (${l.level})` : l.name))
              .join(' · ')}
          </p>
        </section>
      )}
    </article>
  );
}

function SkillChips({ skills }: { skills: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {skills.filter(Boolean).map((skill, i) => (
        <span
          key={i}
          className="rounded bg-action/10 px-2 py-0.5 text-[10px] text-text-primary print:bg-action/10"
        >
          {skill}
        </span>
      ))}
    </span>
  );
}
