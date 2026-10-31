"use client";

/**
 * CVRenderer — template « Moderne sobre » (modern_sobre), le template gratuit.
 * Rend un GeneratedCVData canonique (cv_data_json, la SEULE schéma de contenu :
 * sortie agent = stockage = entrée de rendu, ADR-CONTENT-SCHEMA) en CV A4 propre,
 * ATS-friendly, optimisé pour l'impression. Utilisé par l'aperçu, la route
 * print/PDF et (M2) l'export-service — SANS transformation runtime.
 *
 * La feuille A4, le fit une-page et le signal de rendu vivent dans la coquille
 * partagée CvSheet (M3-T01) : ce fichier ne décrit que la STRUCTURE « moderne
 * sobre ». Sections vides ignorées (CV partiels rendus proprement).
 */
import type { GeneratedCVData } from "./types";
import type { components } from "./generated/api";
import type { DocumentLanguage } from "./i18n";
import { CvSheet } from "./templates/CvSheet";
import { dateRange, deriveCvView, formatMonthYear } from "./templates/format";

type CVThemeTokens = components["schemas"]["CVThemeTokens"];

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
const mutedText = { color: "var(--cv-muted)" } as const;
const headingFont = { fontFamily: "var(--cv-font-heading)" } as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 border-b pb-1 text-[13px] font-bold uppercase tracking-wide"
      style={{
        ...headingFont,
        color: "var(--cv-accent)",
        borderColor: "var(--cv-muted)",
      }}
    >
      {children}
    </h2>
  );
}

export default function CVRenderer({ cv, theme, language }: CVRendererProps) {
  const {
    t,
    fullName,
    contactBits,
    experiences,
    educations,
    projects,
    certifications,
    hardSkills,
    softSkills,
  } = deriveCvView(cv, language);

  return (
    <CvSheet
      theme={theme}
      refitKey={cv}
      contentClassName="text-[11px] leading-relaxed"
    >
      {/* Header */}
      <header className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight" style={headingFont}>
          {fullName || "Votre nom"}
        </h1>
        {contactBits.length > 0 && (
          <p
            className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]"
            style={mutedText}
          >
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
                      <span className="font-normal" style={mutedText}>
                        {" "}
                        — {exp.company}
                      </span>
                    )}
                  </h3>
                  <span className="flex-shrink-0 text-[10px]" style={mutedText}>
                    {/* Canonique : pas d'is_current — end_date null = poste en cours
                        ("" aussi : CV V1 stockés avant coercition). */}
                    {dateRange(t, exp.start_date, exp.end_date, !exp.end_date)}
                  </span>
                </div>
                {exp.location && (
                  <p className="text-[10px] italic" style={mutedText}>
                    {exp.location}
                  </p>
                )}
                {exp.description && (
                  <p className="mt-1 whitespace-pre-line">{exp.description}</p>
                )}
                {(exp.highlighted_skills ?? []).filter(Boolean).length > 0 && (
                  <p className="mt-0.5 text-[10px]" style={mutedText}>
                    {(exp.highlighted_skills ?? []).filter(Boolean).join(" · ")}
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
                <p className="text-[10px]" style={mutedText}>
                  {edu.institution}
                </p>
                {edu.description && (
                  <p className="mt-0.5 whitespace-pre-line">
                    {edu.description}
                  </p>
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
              <span className="font-semibold">
                {t.skillGroups.hard}
                {t.colon}
              </span>
              <SkillChips skills={hardSkills} />
            </div>
          )}
          {softSkills.length > 0 && (
            <div>
              <span className="font-semibold">
                {t.skillGroups.soft}
                {t.colon}
              </span>
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
                  <p className="mt-0.5 whitespace-pre-line">
                    {proj.description}
                  </p>
                )}
                {(proj.relevant_skills ?? []).filter(Boolean).length > 0 && (
                  <p className="mt-0.5 text-[10px]" style={mutedText}>
                    {(proj.relevant_skills ?? []).filter(Boolean).join(" · ")}
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
              <div
                key={cert.id ?? i}
                className="flex items-baseline justify-between gap-3"
              >
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
    </CvSheet>
  );
}

function SkillChips({ skills }: { skills: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {skills.filter(Boolean).map((skill, i) => (
        <span
          key={i}
          className="rounded px-2 py-0.5 text-[10px]"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--cv-accent) 10%, transparent)",
          }}
        >
          {skill}
        </span>
      ))}
    </span>
  );
}
