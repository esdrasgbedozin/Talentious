"use client";

/**
 * CorporateSobre — template « Corporate sobre » (corporate_sobre, M3-T01).
 *
 * Registre visuel : exécutif, rassurant, net (reconversion / cadres, Bible V2).
 * Se distingue de `modern_sobre` SANS barre ni icône (Bible §6.3 : les barres de
 * niveau et icônes sont absentes des templates sobres et ne remplacent jamais
 * l'information écrite) — uniquement par la typographie et la structure :
 *   - en-tête centré « papier à en-tête » (nom en police de titre, filet fin,
 *     contacts centrés), là où modern aligne tout à gauche ;
 *   - titres de section en petites capitales très espacées ;
 *   - compétences en listes de texte groupées (« Techniques : a · b · c »),
 *     là où modern pose des pastilles.
 *
 * Même contenu canonique, même thème `--cv-*`, même coquille A4 partagée (fit
 * une-page, signal d'export) : « aperçu = PDF » est garanti par CvSheet.
 */
import type { GeneratedCVData } from "../types";
import type { components } from "../generated/api";
import type { DocumentLanguage } from "../i18n";
import { CvSheet } from "./CvSheet";
import { dateRange, deriveCvView, formatMonthYear } from "./format";

type CVThemeTokens = components["schemas"]["CVThemeTokens"];

interface CorporateSobreProps {
  cv: GeneratedCVData;
  theme?: CVThemeTokens | null;
  language?: DocumentLanguage | null;
}

// Styles THÉMABLES uniquement (ADR-THEME-DECOUPLED) : inline `var(--cv-*)`,
// jamais de classe de charte app.
const mutedText = { color: "var(--cv-muted)" } as const;
const headingFont = { fontFamily: "var(--cv-font-heading)" } as const;

/** Titre de section « corporate » : petites capitales très espacées, filet fin
 * dessous. Distinct du titre gras plus serré de modern_sobre. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2.5 border-b pb-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
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

/** Compétences d'une expérience/projet : liste de texte (jamais de pastille ni
 * de barre — Bible §6.3). */
function SkillLine({ skills }: { skills: string[] }) {
  return (
    <p className="mt-1 text-[10px]" style={mutedText}>
      {skills.filter(Boolean).join(" · ")}
    </p>
  );
}

export default function CorporateSobre({
  cv,
  theme,
  language,
}: CorporateSobreProps) {
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
      {/* Header — « papier à en-tête » centré */}
      <header className="mb-5 text-center">
        <h1
          className="text-[26px] font-semibold tracking-[0.02em]"
          style={headingFont}
        >
          {fullName || "Votre nom"}
        </h1>
        {/* Filet typographique (hairline border, pas une barre de niveau). */}
        <div
          className="mx-auto mt-2 w-16 border-t"
          style={{ borderColor: "var(--cv-accent)" }}
          aria-hidden="true"
        />
        {contactBits.length > 0 && (
          <p
            className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[10px]"
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
        <section className="mb-5">
          <SectionTitle>{t.sections.profile}</SectionTitle>
          <p className="whitespace-pre-line">{cv.summary}</p>
        </section>
      )}

      {/* Experiences */}
      {experiences.length > 0 && (
        <section className="mb-5">
          <SectionTitle>{t.sections.experience}</SectionTitle>
          <div className="space-y-3.5">
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
                    {/* Canonique : pas d'is_current — end_date null = poste en cours. */}
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
                  <SkillLine skills={exp.highlighted_skills ?? []} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {educations.length > 0 && (
        <section className="mb-5">
          <SectionTitle>{t.sections.education}</SectionTitle>
          <div className="space-y-2.5">
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

      {/* Skills — listes de texte groupées, pas de pastille (distinct de modern) */}
      {(hardSkills.length > 0 || softSkills.length > 0) && (
        <section className="mb-5 break-inside-avoid">
          <SectionTitle>{t.sections.skills}</SectionTitle>
          <div className="space-y-1">
            {hardSkills.length > 0 && (
              <p>
                <span className="font-semibold">
                  {t.skillGroups.hard}
                  {t.colon}
                </span>
                <span style={mutedText}>{hardSkills.join(" · ")}</span>
              </p>
            )}
            {softSkills.length > 0 && (
              <p>
                <span className="font-semibold">
                  {t.skillGroups.soft}
                  {t.colon}
                </span>
                <span style={mutedText}>{softSkills.join(" · ")}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="mb-5">
          <SectionTitle>{t.sections.projects}</SectionTitle>
          <div className="space-y-2.5">
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
                  <SkillLine skills={proj.relevant_skills ?? []} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <SectionTitle>{t.sections.certifications}</SectionTitle>
          <div className="space-y-1.5">
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

      {/* Pas de section Langues (hors schéma canonique) ; `optimization_notes`
          (champ interne, BLK-5) n'est jamais rendu. */}
    </CvSheet>
  );
}
