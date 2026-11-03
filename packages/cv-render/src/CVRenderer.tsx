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
import {
  CertificationEntry,
  ContactLine,
  EducationEntry,
  ExperienceEntry,
  InlineSkills,
  ProjectEntry,
} from "./templates/blocks";
import { deriveCvView } from "./templates/format";

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
    summary,
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
        <ContactLine
          bits={contactBits}
          className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]"
        />
      </header>

      {/* Summary */}
      {summary.trim() && (
        <section className="mb-4">
          <SectionTitle>{t.sections.profile}</SectionTitle>
          <p className="whitespace-pre-line">{summary}</p>
        </section>
      )}

      {/* Experiences */}
      {experiences.length > 0 && (
        <section className="mb-4">
          <SectionTitle>{t.sections.experience}</SectionTitle>
          <div className="space-y-3">
            {experiences.map((exp, i) => (
              <ExperienceEntry
                key={exp.id ?? i}
                exp={exp}
                t={t}
                skills={
                  <InlineSkills
                    skills={exp.highlighted_skills ?? []}
                    className="mt-0.5 text-[10px]"
                  />
                }
              />
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
              <EducationEntry key={edu.id ?? i} edu={edu} t={t} />
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
              <ProjectEntry
                key={proj.id ?? i}
                proj={proj}
                t={t}
                skills={
                  <InlineSkills
                    skills={proj.relevant_skills ?? []}
                    className="mt-0.5 text-[10px]"
                  />
                }
              />
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
              <CertificationEntry key={cert.id ?? i} cert={cert} t={t} />
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
