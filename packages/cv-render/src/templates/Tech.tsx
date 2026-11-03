"use client";

/**
 * Tech — template « Tech » (tech, M3-T03).
 *
 * Registre visuel : ingénieur / développeur / freelance tech (personas P2 selon
 * le métier et P4, Bible V2). Se distingue des autres templates UNIQUEMENT par
 * la structure et la typographie (le thème — couleurs, polices — reste
 * orthogonal, ADR-THEME-DECOUPLED) :
 *   - « stack d'abord » : la section Compétences passe AVANT l'expérience, là où
 *     modern/corporate ouvrent sur l'expérience — un CV tech se scanne par la
 *     stack ;
 *   - titres de section préfixés d'un sigle « # » (cue markdown/code,
 *     décoratif), sans filet, là où modern souligne et corporate met en petites
 *     capitales espacées ;
 *   - compétences en tags à BORDURE fine (pas de remplissage), distincts des
 *     pastilles pleines de modern et du texte « a · b · c » de corporate.
 *
 * Ces tags portent une information écrite (le nom de la compétence) : ce ne sont
 * JAMAIS des barres de niveau ni des icônes (Bible §6.3 — le tech n'est pas un
 * template « sobre », mais on s'interdit quand même toute jauge décorative :
 * elles ne disent rien de précis et passent mal en lecture ATS).
 *
 * Même contenu canonique, même thème `--cv-*`, même coquille A4 partagée (fit
 * une-page, signal d'export) : « aperçu = PDF » est garanti par CvSheet.
 */
import type { GeneratedCVData } from "../types";
import type { components } from "../generated/api";
import type { DocumentLanguage } from "../i18n";
import { CvSheet } from "./CvSheet";
import {
  CertificationEntry,
  ContactLine,
  EducationEntry,
  ExperienceEntry,
  InlineSkills,
  ProjectEntry,
  SlashSeparator,
} from "./blocks";
import { deriveCvView } from "./format";

type CVThemeTokens = components["schemas"]["CVThemeTokens"];

interface TechProps {
  cv: GeneratedCVData;
  theme?: CVThemeTokens | null;
  language?: DocumentLanguage | null;
}

// Styles THÉMABLES uniquement (ADR-THEME-DECOUPLED) : inline `var(--cv-*)`,
// jamais de classe de charte app, jamais de police codée en dur.
const headingFont = { fontFamily: "var(--cv-font-heading)" } as const;

/** Titre de section « tech » : marqueur « curseur » (barre verticale accent,
 * DÉCOR non-texte — pas un glyphe, pour ne rien laisser dans la couche texte du
 * PDF lue par un ATS, constat de revue) + libellé en capitales, sans filet.
 * Distinct du titre souligné de modern, des petites capitales à filet de
 * corporate, et du carré de creatif. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide"
      style={{ ...headingFont, color: "var(--cv-accent)" }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-3 w-0.5 flex-shrink-0"
        style={{ backgroundColor: "var(--cv-accent)" }}
      />
      {children}
    </h2>
  );
}

/** Compétences en tags à bordure fine (jamais de pastille pleine ni de barre —
 * cf. en-tête de fichier). Le nom de la compétence EST l'information. */
function SkillTags({ skills }: { skills: string[] }) {
  const named = skills.filter(Boolean);
  if (named.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {named.map((skill, i) => (
        <span
          key={i}
          data-cv-chip="tag"
          className="rounded-sm border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: "var(--cv-muted)" }}
        >
          {skill}
        </span>
      ))}
    </span>
  );
}

export default function Tech({ cv, theme, language }: TechProps) {
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
      {/* Header — aligné à gauche, filet pleine largeur, contacts « chemin » */}
      <header className="mb-4">
        <h1
          className="text-[28px] font-bold tracking-tight"
          style={headingFont}
        >
          {fullName || "Votre nom"}
        </h1>
        <ContactLine
          bits={contactBits}
          className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]"
          separator={SlashSeparator}
        />
        <div
          className="mt-3 border-t"
          style={{ borderColor: "var(--cv-muted)" }}
          aria-hidden="true"
        />
      </header>

      {/* Summary */}
      {summary.trim() && (
        <section className="mb-4">
          <SectionTitle>{t.sections.profile}</SectionTitle>
          <p className="whitespace-pre-line">{summary}</p>
        </section>
      )}

      {/* Skills — « stack d'abord » : AVANT l'expérience (personnalité tech).
          Rendues en tags à bordure (distinct de modern/corporate). */}
      {(hardSkills.length > 0 || softSkills.length > 0) && (
        <section className="mb-4 break-inside-avoid">
          <SectionTitle>{t.sections.skills}</SectionTitle>
          {hardSkills.length > 0 && (
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-semibold">
                {t.skillGroups.hard}
                {t.colon}
              </span>
              <SkillTags skills={hardSkills} />
            </div>
          )}
          {softSkills.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-semibold">
                {t.skillGroups.soft}
                {t.colon}
              </span>
              <SkillTags skills={softSkills} />
            </div>
          )}
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
                skills={<InlineSkills skills={exp.highlighted_skills ?? []} />}
              />
            ))}
          </div>
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
                skills={<InlineSkills skills={proj.relevant_skills ?? []} />}
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

      {/* Pas de section Langues (hors schéma canonique) ; `optimization_notes`
          (champ interne, BLK-5) n'est jamais rendu. */}
    </CvSheet>
  );
}
