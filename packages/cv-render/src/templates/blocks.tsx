"use client";

/**
 * Blocs de contenu PARTAGÉS par les templates (DET-M3-TEMPLATES).
 *
 * Les 4 templates (modern_sobre, corporate_sobre, tech, creatif) décrivaient
 * chacun, à l'identique, le CŒUR de leurs entrées (titre + société + dates +
 * lieu + description d'une expérience ; nom + date + description d'un projet ;
 * diplôme/établissement/date ; certification) et leur ligne de contacts —
 * ~150 lignes dupliquées ×4. La personnalité d'un template tient à sa STRUCTURE
 * de section (titres, en-tête) et au RENDU des compétences de section
 * (pastilles / texte / tags / pilules), PAS au cœur des entrées : on extrait
 * donc ce cœur ici, une seule fois, et chaque template injecte sa variation de
 * compétences d'entrée via le *slot* `skills`.
 *
 * Invariant du refacto : DOM octet-identique à l'ancien JSX inline — les
 * snapshots des 4 templates restent inchangés (preuve du « zéro changement de
 * comportement »). Rien de thémable n'est codé en dur : styles toujours en
 * inline `var(--cv-*)` (ADR-THEME-DECOUPLED).
 */
import type { CVLocale } from "../i18n";
import type {
  CvCertificationView,
  CvEducationView,
  CvExperienceView,
  CvProjectView,
} from "./format";
import { dateRange, formatMonthYear } from "./format";

const mutedText = { color: "var(--cv-muted)" } as const;

/** Séparateur de contacts DÉCOR non-texte (pastille accent-muet), PAS un glyphe
 * « • » : rien dans la couche texte du PDF lue par un ATS — cohérent avec les
 * marqueurs de titre de section déjà passés en décor pur (constat de revue M3).
 * Défaut de 3 templates sur 4. */
export const DotSeparator = (
  <span
    aria-hidden="true"
    className="inline-block h-[3px] w-[3px] flex-shrink-0 rounded-full"
    style={{ backgroundColor: "var(--cv-muted)" }}
  />
);

/** Variante « chemin » du template tech (évoquait le « / » d'un fil d'Ariane) :
 * fine barre oblique, toujours en décor non-texte (aucun glyphe « / » extrait
 * par un ATS). */
export const SlashSeparator = (
  <span
    aria-hidden="true"
    className="inline-block h-3 w-px flex-shrink-0 rotate-[18deg]"
    style={{ backgroundColor: "var(--cv-muted)" }}
  />
);

/** Ligne de contacts (email · téléphone · ville · LinkedIn). La classe du
 * paragraphe et le séparateur restent la personnalité de chaque template
 * (alignement, taille, pastille ou barre). Le séparateur est un DÉCOR non-texte
 * (cf. DotSeparator/SlashSeparator) : il ne laisse aucun caractère parasite dans
 * la couche texte du PDF lue par un ATS. Vide ⇒ rien (parité avec le garde
 * `length > 0` inline d'origine). */
export function ContactLine({
  bits,
  className,
  separator = DotSeparator,
}: {
  bits: string[];
  className: string;
  separator?: React.ReactNode;
}) {
  if (bits.length === 0) return null;
  return (
    <p className={className} style={mutedText}>
      {bits.map((bit, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && separator}
          {bit}
        </span>
      ))}
    </p>
  );
}

/** Compétences d'une entrée (expérience / projet) : texte discret « a · b · c ».
 * Partagé par les 4 templates (les tags/pilules/pastilles ne concernent QUE la
 * section Compétences, pas les entrées). La marge est passée par `className` car
 * elle diffère d'un template à l'autre ; vide ⇒ rien. */
export function InlineSkills({
  skills,
  className = "mt-1 text-[10px]",
}: {
  skills: string[];
  className?: string;
}) {
  const named = skills.filter(Boolean);
  if (named.length === 0) return null;
  return (
    <p className={className} style={mutedText}>
      {named.join(" · ")}
    </p>
  );
}

/** Cœur d'une entrée d'expérience : titre, société, dates, lieu, description.
 * Le rendu des compétences de l'entrée est injecté via `skills` (slot) pour que
 * chaque template garde sa variation sans dupliquer le cœur. */
export function ExperienceEntry({
  exp,
  t,
  skills,
}: {
  exp: CvExperienceView;
  t: CVLocale;
  skills?: React.ReactNode;
}) {
  return (
    <div className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">
          {exp.title}
          {exp.company && (
            <span className="font-normal" style={mutedText}>
              {", "}
              {exp.company}
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
      {skills}
    </div>
  );
}

/** Cœur d'une entrée de projet : nom, date d'achèvement, description. Le rendu
 * des compétences du projet est injecté via `skills` (slot). */
export function ProjectEntry({
  proj,
  t,
  skills,
}: {
  proj: CvProjectView;
  t: CVLocale;
  skills?: React.ReactNode;
}) {
  return (
    <div className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">{proj.name}</h3>
        <span className="flex-shrink-0 text-[10px]" style={mutedText}>
          {formatMonthYear(t, proj.completion_date)}
        </span>
      </div>
      {proj.description && (
        <p className="mt-0.5 whitespace-pre-line">{proj.description}</p>
      )}
      {skills}
    </div>
  );
}

/** Entrée de formation : diplôme, date, établissement, description. Identique
 * sur les 4 templates (aucune variation de personnalité). */
export function EducationEntry({
  edu,
  t,
}: {
  edu: CvEducationView;
  t: CVLocale;
}) {
  return (
    <div className="break-inside-avoid">
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
        <p className="mt-0.5 whitespace-pre-line">{edu.description}</p>
      )}
    </div>
  );
}

/** Entrée de certification : nom (émetteur en option), date. Identique sur les 4
 * templates. La classe `break-inside-avoid` n'est PAS posée ici (la section la
 * portait au niveau du conteneur, pas de l'entrée) — parité DOM. */
export function CertificationEntry({
  cert,
  t,
}: {
  cert: CvCertificationView;
  t: CVLocale;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>
        <span className="font-semibold">{cert.name}</span>
        {cert.issuer && <span style={mutedText}>, {cert.issuer}</span>}
      </span>
      <span className="flex-shrink-0 text-[10px]" style={mutedText}>
        {formatMonthYear(t, cert.issue_date)}
      </span>
    </div>
  );
}
