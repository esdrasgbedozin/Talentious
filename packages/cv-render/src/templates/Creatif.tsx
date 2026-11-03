"use client";

/**
 * Creatif — template « Créatif » (creatif, M3-T05).
 *
 * Registre visuel : expressif, éditorial (freelances / indépendants, personas
 * P4 — Bible V2). C'est le template le plus « dessiné » de la gamme, MAIS il
 * reste ATS-lisible et respecte la DoD « texte lisible indépendamment du
 * décor » : le décor (barre d'accent, marqueurs de section) est PUREMENT
 * décoratif (`aria-hidden`, ne porte jamais de texte) ; TOUT texte est posé sur
 * le fond `--cv-background` avec les couleurs du thème (texte/accent/muted), qui
 * sont validées ≥ 4.5:1 côté serveur (M1-T09). La lisibilité ne dépend donc
 * jamais de la couleur d'accent choisie.
 *
 * Personnalité tenue uniquement par la structure et la typographie (thème
 * couleurs/polices orthogonal, ADR-THEME-DECOUPLED) :
 *   - en-tête éditorial BICHROME : prénom en `--cv-accent`, nom en `--cv-text`,
 *     souligné d'une barre d'accent épaisse (décorative) ;
 *   - titres de section préfixés d'un marqueur carré « ■ » accent (décoratif),
 *     distinct du « # » de tech, du souligné de modern et du filet de corporate ;
 *   - compétences en PILULES arrondies (tint + bordure d'accent, texte en
 *     `--cv-text`), distinctes des pastilles de modern, des tags de tech et du
 *     texte de corporate.
 *
 * Aucune barre de niveau ni icône graphique (Bible §6.3). Même contenu
 * canonique, même coquille A4 partagée (fit une-page, signal d'export) :
 * « aperçu = PDF » est garanti par CvSheet.
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
} from "./blocks";
import { deriveCvView } from "./format";

type CVThemeTokens = components["schemas"]["CVThemeTokens"];

interface CreatifProps {
  cv: GeneratedCVData;
  theme?: CVThemeTokens | null;
  language?: DocumentLanguage | null;
}

// Styles THÉMABLES uniquement (ADR-THEME-DECOUPLED) : inline `var(--cv-*)`,
// jamais de classe de charte app, jamais de police codée en dur.
const accentText = { color: "var(--cv-accent)" } as const;
const headingFont = { fontFamily: "var(--cv-font-heading)" } as const;

/** Titre de section « créatif » : marqueur carré accent (décoratif) + libellé en
 * accent. Le libellé est du TEXTE sur le fond (jamais sur un aplat) — lisible
 * quel que soit le décor. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.1em]"
      style={{ ...headingFont, ...accentText }}
    >
      {/* Marqueur carré DÉCOR non-texte (pas un glyphe « ■ ») : rien dans la
          couche texte du PDF lue par un ATS (constat de revue). */}
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 flex-shrink-0 rounded-[1px]"
        style={{ backgroundColor: "var(--cv-accent)" }}
      />
      {children}
    </h2>
  );
}

/** Compétences en pilules : tint + bordure d'accent, mais TEXTE en `--cv-text`
 * (jamais sur l'accent) ⇒ lisible indépendamment de la couleur d'accent du
 * thème. Jamais une barre de niveau (cf. en-tête de fichier). */
function SkillPills({ skills }: { skills: string[] }) {
  const named = skills.filter(Boolean);
  if (named.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5 align-middle">
      {named.map((skill, i) => (
        <span
          key={i}
          data-cv-chip="pill"
          className="rounded-full border px-2.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--cv-accent) 10%, transparent)",
            borderColor:
              "color-mix(in srgb, var(--cv-accent) 35%, transparent)",
            color: "var(--cv-text)",
          }}
        >
          {skill}
        </span>
      ))}
    </span>
  );
}

export default function Creatif({ cv, theme, language }: CreatifProps) {
  const {
    t,
    firstName,
    lastName,
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
      {/* Header — éditorial bichrome + barre d'accent décorative */}
      <header className="mb-5">
        <h1
          className="text-[32px] font-bold leading-tight tracking-tight"
          style={headingFont}
        >
          {firstName || lastName ? (
            <>
              <span style={accentText}>{firstName}</span>
              {firstName && lastName ? " " : ""}
              <span>{lastName}</span>
            </>
          ) : (
            fullName || "Votre nom"
          )}
        </h1>
        {/* Barre d'accent : décor PUR (aria-hidden, aucun texte) — la lisibilité
            du texte ne dépend jamais de cet aplat. Largeur fixe (pas une jauge). */}
        <div
          className="mt-2 h-1 w-24 rounded-full"
          style={{ backgroundColor: "var(--cv-accent)" }}
          aria-hidden="true"
        />
        <ContactLine
          bits={contactBits}
          className="mt-2.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]"
        />
      </header>

      {/* Summary */}
      {summary.trim() && (
        <section className="mb-5">
          <SectionTitle>{t.sections.profile}</SectionTitle>
          <p className="whitespace-pre-line">{summary}</p>
        </section>
      )}

      {/* Experiences */}
      {experiences.length > 0 && (
        <section className="mb-5">
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

      {/* Skills — pilules arrondies (tint + bordure accent, texte lisible) */}
      {(hardSkills.length > 0 || softSkills.length > 0) && (
        <section className="mb-5 break-inside-avoid">
          <SectionTitle>{t.sections.skills}</SectionTitle>
          {hardSkills.length > 0 && (
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
              <span className="font-semibold">
                {t.skillGroups.hard}
                {t.colon}
              </span>
              <SkillPills skills={hardSkills} />
            </div>
          )}
          {softSkills.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
              <span className="font-semibold">
                {t.skillGroups.soft}
                {t.colon}
              </span>
              <SkillPills skills={softSkills} />
            </div>
          )}
        </section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="mb-5">
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
        <section className="mb-5">
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
        <section className="mb-5 break-inside-avoid">
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
