'use client';

/**
 * CVRenderer — renders a canonical GeneratedCVData (cv_data_json, the ONE content
 * schema: agent output = storage = render input, ADR-CONTENT-SCHEMA) as a clean,
 * ATS-friendly, print-optimized A4 CV. Used by the live preview, the print/PDF
 * route, and (M2) the export-service — with NO runtime transformation.
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
import type { GeneratedCVData } from './types';
import type { components } from './generated/api';
import { themeToCssVars } from './theme';
import { getCVLocale, type CVLocale, type DocumentLanguage } from './i18n';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

interface CVRendererProps {
  cv: GeneratedCVData;
  /** Snapshot de thème du document (contrat `CVThemeTokens`). Absent : défaut
   * anthracite quasi-monochrome (D2) — cas de tous les documents existants. */
  theme?: CVThemeTokens | null;
  /** Langue de RENDU de l'enveloppe (`DocumentLanguage`) : libellés générés
   * (sections, mois, « aujourd'hui ») uniquement — ne traduit jamais le
   * contenu. Absent ou inconnu : FR (tous les documents existants). */
  language?: DocumentLanguage | null;
}

// Styles THÉMABLES : toujours en inline `var(--cv-*)` (règle ADR-THEME-DECOUPLED
// arbitrée en revue T09) — jamais de classe de charte app, jamais de build CSS
// requis pour que le thème s'applique (aperçu Next = Chromium export-service).
const mutedText = { color: 'var(--cv-muted)' } as const;
const headingFont = { fontFamily: 'var(--cv-font-heading)' } as const;

// A4 geometry and sheet padding (mm). Kept in sync with the print @page rules.
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAD_Y_MM = 14;
const PAD_X_MM = 16;
const MM_TO_PX = 96 / 25.4;
// Never shrink below this — past it the CV is unreadable and the user should trim
// content instead. In practice content stays well above this floor.
const MIN_SCALE = 0.62;

/** "2020-03" | "2020-03-15" → "mars 2020" / "Mar 2020" selon la locale ; "" → "". */
function formatMonthYear(t: CVLocale, value?: string | null): string {
  // Document corrompu (non-chaîne) : ne jamais renvoyer un objet comme enfant
  // React — le rendu Chromium (M2) d'un document ne doit pas pouvoir planter.
  if (!value || typeof value !== 'string') return '';
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${t.months[idx]} ${year}` : year;
}

function dateRange(
  t: CVLocale,
  start?: string | null,
  end?: string | null,
  isCurrent?: boolean,
): string {
  const from = formatMonthYear(t, start);
  const to = isCurrent ? t.present : formatMonthYear(t, end);
  if (from && to) return `${from} — ${to}`;
  return from || to || '';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 border-b pb-1 text-[13px] font-bold uppercase tracking-wide"
      style={{ ...headingFont, color: 'var(--cv-accent)', borderColor: 'var(--cv-muted)' }}
    >
      {children}
    </h2>
  );
}

export default function CVRenderer({ cv, theme, language }: CVRendererProps) {
  const t = getCVLocale(language);
  const p = cv.personal_info;
  const fullName = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
  const location = [p?.city, p?.country].filter(Boolean).join(', ');
  const contactBits = [p?.email, p?.phone, location, p?.linkedin].filter(Boolean);

  const experiences = cv.selected_experiences ?? [];
  const educations = cv.selected_educations ?? [];
  const projects = cv.selected_projects ?? [];
  const certifications = cv.selected_certifications ?? [];
  // highlighted_skills est une liste plate catégorisée : scindée pour l'affichage.
  // Tolérance défensive (defense in depth) : les CV V1 stockés AVANT la ceinture
  // de coercition portent des catégories libres (« Hard Skill », « technical »…)
  // — on scinde sur « soft » (insensible à la casse), tout le reste est technique,
  // comme l'ancien normalizeCVData. L'enum canonique satisfait trivialement ce test.
  const allSkills = cv.highlighted_skills ?? [];
  const isSoft = (category: unknown) =>
    typeof category === 'string' && category.toLowerCase().includes('soft');
  const named = allSkills.filter((s) => s && typeof s.name === 'string' && s.name);
  const hardSkills = named.filter((s) => !isSoft(s.category)).map((s) => s.name);
  const softSkills = named.filter((s) => isSoft(s.category)).map((s) => s.name);

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
  }, [cv]);

  return (
    <div
      className="cv-sheet relative mx-auto overflow-hidden"
      style={{
        ...themeToCssVars(theme),
        width: `${A4_WIDTH_MM}mm`,
        height: `${A4_HEIGHT_MM}mm`,
        backgroundColor: 'var(--cv-background)',
        color: 'var(--cv-text)',
        fontFamily: 'var(--cv-font-body)',
      }}
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
        <h1 className="text-3xl font-bold tracking-tight" style={headingFont}>
          {fullName || 'Votre nom'}
        </h1>
        {contactBits.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]" style={mutedText}>
            {contactBits.map((bit, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span style={mutedText}>•</span>}
                {bit}
              </span>
            ))}
          </p>
        )}
      </header>

      {/* Summary */}
      {cv.summary?.trim() && (
        <section className="mb-4">
          <SectionTitle>{t.sections.profile}</SectionTitle>
          <p className="whitespace-pre-line">{cv.summary}</p>
        </section>
      )}

      {/* Experiences */}
      {experiences.length > 0 && (
        <section className="mb-4">
          <SectionTitle>{t.sections.experience}</SectionTitle>
          <div className="space-y-3">
            {experiences.map((exp, i) => (
              <div key={exp.id ?? i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">
                    {exp.title}
                    {exp.company && (
                      <span className="font-normal" style={mutedText}> — {exp.company}</span>
                    )}
                  </h3>
                  <span className="flex-shrink-0 text-[10px]" style={mutedText}>
                    {/* Canonique : pas d'is_current — end_date null = poste en cours
                        ("" aussi : CV V1 stockés avant coercition). */}
                    {dateRange(t, exp.start_date, exp.end_date, !exp.end_date)}
                  </span>
                </div>
                {exp.location && (
                  <p className="text-[10px] italic" style={mutedText}>{exp.location}</p>
                )}
                {exp.description && (
                  <p className="mt-1 whitespace-pre-line">{exp.description}</p>
                )}
                {(exp.highlighted_skills ?? []).filter(Boolean).length > 0 && (
                  <p className="mt-0.5 text-[10px]" style={mutedText}>
                    {(exp.highlighted_skills ?? []).filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {educations.length > 0 && (
        <section className="mb-4">
          <SectionTitle>{t.sections.education}</SectionTitle>
          <div className="space-y-2">
            {educations.map((edu, i) => (
              <div key={edu.id ?? i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{edu.degree}</h3>
                  <span className="flex-shrink-0 text-[10px]" style={mutedText}>
                    {formatMonthYear(t, edu.end_date)}
                  </span>
                </div>
                <p className="text-[10px]" style={mutedText}>{edu.institution}</p>
                {edu.description && (
                  <p className="mt-0.5 whitespace-pre-line">{edu.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills */}
      {(hardSkills.length > 0 || softSkills.length > 0) && (
        <section className="mb-4 break-inside-avoid">
          <SectionTitle>{t.sections.skills}</SectionTitle>
          {hardSkills.length > 0 && (
            <div className="mb-1.5">
              <span className="font-semibold">{t.skillGroups.hard}{t.colon}</span>
              <SkillChips skills={hardSkills} />
            </div>
          )}
          {softSkills.length > 0 && (
            <div>
              <span className="font-semibold">{t.skillGroups.soft}{t.colon}</span>
              <SkillChips skills={softSkills} />
            </div>
          )}
        </section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="mb-4">
          <SectionTitle>{t.sections.projects}</SectionTitle>
          <div className="space-y-2">
            {projects.map((proj, i) => (
              <div key={proj.id ?? i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{proj.name}</h3>
                  <span className="flex-shrink-0 text-[10px]" style={mutedText}>
                    {formatMonthYear(t, proj.completion_date)}
                  </span>
                </div>
                {proj.description && (
                  <p className="mt-0.5 whitespace-pre-line">{proj.description}</p>
                )}
                {(proj.relevant_skills ?? []).filter(Boolean).length > 0 && (
                  <p className="mt-0.5 text-[10px]" style={mutedText}>
                    {(proj.relevant_skills ?? []).filter(Boolean).join(' · ')}
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
          <SectionTitle>{t.sections.certifications}</SectionTitle>
          <div className="space-y-1">
            {certifications.map((cert, i) => (
              <div key={cert.id ?? i} className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="font-semibold">{cert.name}</span>
                  {cert.issuer && (
                    <span style={mutedText}> — {cert.issuer}</span>
                  )}
                </span>
                <span className="flex-shrink-0 text-[10px]" style={mutedText}>
                  {formatMonthYear(t, cert.issue_date)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pas de section Langues : hors schéma canonique GeneratedCVData (M0-T08b).
          `optimization_notes` (champ interne, BLK-5) n'est jamais rendu. */}
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
          className="rounded px-2 py-0.5 text-[10px]"
          style={{ backgroundColor: 'color-mix(in srgb, var(--cv-accent) 10%, transparent)' }}
        >
          {skill}
        </span>
      ))}
    </span>
  );
}
