/**
 * Dictionnaire i18n du RENDU (M0-T13) : libellés d'interface du CV (titres de
 * sections, groupes de compétences, mois, « poste en cours ») en FR et EN.
 *
 * Portée stricte : la langue de rendu vient de l'ENVELOPPE du document
 * (`DocumentLanguage`, contrat V2) et ne traduit JAMAIS le contenu — seuls les
 * libellés générés par le renderer changent. Résolution stricte avec repli FR
 * (même philosophie et même garde `Object.hasOwn` que le registre de templates,
 * ADR-TEMPLATE-REGISTRY) : les documents existants, sans `language`, rendent
 * à l'identique.
 */
import type { components } from './generated/api';

export type DocumentLanguage = components['schemas']['DocumentLanguage'];

export interface CVLocale {
  sections: {
    profile: string;
    experience: string;
    education: string;
    skills: string;
    projects: string;
    certifications: string;
  };
  /** Sous-groupes de la section compétences (hard / soft). */
  skillGroups: { hard: string; soft: string };
  /** Séparateur typographique après un libellé (FR : espace avant les deux-points). */
  colon: string;
  /** 12 abréviations de mois, indexées 0-11 (format `YYYY-MM` du canonique) —
   * tuple structurel : un 13e mois ou un manquant ne compile pas. */
  months: MonthLabels;
  /** Libellé « poste en cours » (end_date null). */
  present: string;
}

type MonthLabels = readonly [
  string, string, string, string, string, string,
  string, string, string, string, string, string,
];

export const DEFAULT_CV_LANGUAGE: DocumentLanguage = 'fr';

/** Gel récursif : les dictionnaires sont PARTAGÉS par tous les rendus du
 * processus (app, export-service M2) — aucune mutation accidentelle (ni test
 * contaminant les suivants) ne doit pouvoir altérer les libellés. */
function freezeLocale(locale: CVLocale): CVLocale {
  Object.freeze(locale.sections);
  Object.freeze(locale.skillGroups);
  Object.freeze(locale.months);
  return Object.freeze(locale);
}

const LOCALES: Record<DocumentLanguage, CVLocale> = {
  fr: {
    sections: {
      profile: 'Profil',
      experience: 'Expérience professionnelle',
      education: 'Formation',
      skills: 'Compétences',
      projects: 'Projets',
      certifications: 'Certifications',
    },
    skillGroups: { hard: 'Techniques', soft: 'Transversales' },
    colon: ' : ',
    months: [
      'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
      'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
    ],
    present: "aujourd'hui",
  },
  en: {
    sections: {
      profile: 'Summary',
      experience: 'Professional Experience',
      education: 'Education',
      skills: 'Skills',
      projects: 'Projects',
      certifications: 'Certifications',
    },
    skillGroups: { hard: 'Technical skills', soft: 'Soft skills' },
    colon: ': ',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    present: 'Present',
  },
};

export const CV_RENDER_LOCALES: Record<DocumentLanguage, CVLocale> = Object.freeze({
  fr: freezeLocale(LOCALES.fr),
  en: freezeLocale(LOCALES.en),
});

/** Dictionnaire pour une langue d'enveloppe ; tout ce qui n'est pas exactement
 * un `DocumentLanguage` connu (casse comprise) retombe sur le FR. */
export function getCVLocale(language?: unknown): CVLocale {
  return typeof language === 'string' && Object.hasOwn(CV_RENDER_LOCALES, language)
    ? CV_RENDER_LOCALES[language as DocumentLanguage]
    : CV_RENDER_LOCALES[DEFAULT_CV_LANGUAGE];
}
