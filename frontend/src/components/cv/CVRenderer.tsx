'use client';

/**
 * CVRenderer — renders a ProfileData (cv_data_json) as a clean, ATS-friendly,
 * print-optimized A4 CV. Used both for the live preview in the editor and for the
 * print/PDF route.
 *
 * Single-page guarantee: the sheet is a fixed A4 box (210×297mm, overflow hidden)
 * and the content is auto-scaled down just enough to fit exactly one page. Because
 * the on-screen preview and the printed PDF render the *same* fitted box, the
 * preview is a faithful WYSIWYG of the downloaded PDF (no more "aperçu ≠ PDF", no
 * more content spilling onto a near-empty second page).
 *
 * Empty sections are skipped so partial CVs still render cleanly.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { UserProfile } from '@/types/profile';

interface CVRendererProps {
  profile: UserProfile;
}

// A4 geometry and sheet padding (mm). Kept in sync with the print @page rules.
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAD_Y_MM = 14;
const PAD_X_MM = 16;
const MM_TO_PX = 96 / 25.4;
// Never shrink below this — past it the CV is unreadable and the user should trim
// content instead. In practice content stays well above this floor.
const MIN_SCALE = 0.62;

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

  // Measure the natural (unscaled) content height and shrink to fit one A4 page.
  // scrollHeight ignores the CSS transform, so measuring while scaled is stable
  // and converges in a single pass (no resize feedback loop). A ResizeObserver
  // keeps it correct as the user edits the CV live.
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const availableHeightPx = (A4_HEIGHT_MM - 2 * PAD_Y_MM) * MM_TO_PX;
    const fit = () => {
      const natural = el.scrollHeight;
      if (!natural) return;
      const next = Math.min(1, availableHeightPx / natural);
      setScale(next < MIN_SCALE ? MIN_SCALE : next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [profile]);

  return (
    <div
      className="cv-sheet relative mx-auto overflow-hidden bg-white text-text-primary"
      style={{ width: `${A4_WIDTH_MM}mm`, height: `${A4_HEIGHT_MM}mm` }}
    >
      <div style={{ padding: `${PAD_Y_MM}mm ${PAD_X_MM}mm` }}>
        <div
          ref={contentRef}
          className="text-[11px] leading-relaxed"
          style={{
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top center',
          }}
        >
      {/* Header */}
      <header className="mb-4">
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
        <section className="mb-4">
          <SectionTitle>Profil</SectionTitle>
          <p className="whitespace-pre-line text-text-primary">{profile.summary}</p>
        </section>
      )}

      {/* Experiences */}
      {experiences.length > 0 && (
        <section className="mb-4">
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
        <section className="mb-4">
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
        <section className="mb-4 break-inside-avoid">
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
        <section className="mb-4">
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
        <section className="mb-4 break-inside-avoid">
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
        </div>
      </div>
    </div>
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
