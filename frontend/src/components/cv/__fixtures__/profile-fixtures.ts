/**
 * Entrées ProfileData représentatives pour le test de non-régression du rendu
 * (M0-T08 — extraction de CVRenderer à comportement constant). Forme ProfileData
 * = celle réellement consommée par CVRenderer aujourd'hui. (Les fixtures
 * fixtures/cv-reference/*.json sont au format canonique GeneratedCVData, consommé
 * par le renderer après le ticket de réconciliation distinct.)
 */
import type { UserProfile } from '@/types/profile';

/** CV complet : toutes les sections peuplées. */
export const completeProfile: UserProfile = {
  personal_info: {
    first_name: 'Alice',
    last_name: 'Martin',
    email: 'alice.martin@example.com',
    phone: '+33 6 12 34 56 78',
    city: 'Lyon',
    country: 'France',
    linkedin: 'https://linkedin.com/in/alicemartin',
  },
  summary: 'Ingénieure logiciel orientée produit, 8 ans d\'expérience en systèmes distribués.',
  experiences: [
    {
      id: 'exp-1',
      title: 'Lead Backend',
      company: 'Acme',
      start_date: '2021-01',
      end_date: null,
      is_current: true,
      location: 'Lyon',
      description: 'Pilotage d\'une équipe de 5 ingénieurs.',
      achievements: ['Réduit la latence de 40%', 'Migré vers une architecture événementielle'],
    },
    {
      id: 'exp-2',
      title: 'Développeuse Backend',
      company: 'Globex',
      start_date: '2017-09',
      end_date: '2020-12',
      is_current: false,
      location: 'Paris',
      description: 'Conception d\'APIs à fort trafic.',
      achievements: ['Lancé 3 services majeurs'],
    },
  ],
  educations: [
    {
      id: 'edu-1',
      degree: 'Master Informatique',
      field: 'Systèmes distribués',
      institution: 'INSA Lyon',
      location: 'Lyon',
      grade: 'Mention Bien',
      start_date: '2012-09',
      end_date: '2017-06',
      description: 'Spécialisation cloud.',
    },
  ],
  skills: {
    hard: ['Python', 'Go', 'PostgreSQL', 'Kubernetes'],
    soft: ['Leadership', 'Communication'],
  },
  projects: [
    {
      id: 'proj-1',
      name: 'Pipeline temps réel',
      role: 'Architecte',
      start_date: '2022-03',
      end_date: '2022-11',
      description: 'Traitement de flux à grande échelle.',
      technologies: ['Kafka', 'Flink'],
    },
  ],
  certifications: [
    { id: 'cert-1', name: 'CKA', issuer: 'CNCF', issue_date: '2023-05' },
  ],
  languages: [
    { name: 'Français', level: 'Natif' },
    { name: 'Anglais', level: 'C1' },
  ],
};

/** CV minimal : seulement identité + résumé (CV partiel légitime). */
export const minimalProfile: UserProfile = {
  personal_info: {
    first_name: 'Bob',
    last_name: 'Durand',
    email: 'bob.durand@example.com',
    country: null,
  },
  summary: 'En reconversion vers le développement web.',
  experiences: [],
  educations: [],
  skills: { hard: [], soft: [] },
  projects: [],
  certifications: [],
  languages: [],
};

/** CV dense : beaucoup d'entrées (chemin d'auto-ajustement). */
export const denseProfile: UserProfile = {
  personal_info: {
    first_name: 'Carla',
    last_name: 'Nguyen',
    email: 'carla.nguyen@example.com',
    phone: '+33 7 00 00 00 00',
    city: 'Nantes',
    country: 'France',
    linkedin: 'https://linkedin.com/in/carlanguyen',
  },
  summary: 'Développeuse full-stack polyvalente avec un fort historique de livraisons.',
  experiences: Array.from({ length: 5 }, (_, i) => ({
    id: `exp-${i + 1}`,
    title: `Poste ${i + 1}`,
    company: `Entreprise ${i + 1}`,
    start_date: `20${10 + i}-01`,
    end_date: `20${11 + i}-01`,
    is_current: false,
    location: 'Nantes',
    description: 'Développement et maintenance d\'applications.',
    achievements: ['Réalisation A', 'Réalisation B', 'Réalisation C'],
  })),
  educations: Array.from({ length: 2 }, (_, i) => ({
    id: `edu-${i + 1}`,
    degree: `Diplôme ${i + 1}`,
    field: 'Informatique',
    institution: `École ${i + 1}`,
    location: 'Nantes',
    grade: null,
    start_date: `20${5 + i}-09`,
    end_date: `20${8 + i}-06`,
    description: null,
  })),
  skills: {
    hard: ['JS', 'TS', 'React', 'Node', 'SQL', 'Docker', 'AWS', 'Redis'],
    soft: ['Rigueur', 'Autonomie', 'Esprit d\'équipe'],
  },
  projects: Array.from({ length: 3 }, (_, i) => ({
    id: `proj-${i + 1}`,
    name: `Projet ${i + 1}`,
    role: 'Développeuse',
    start_date: `202${i}-01`,
    end_date: `202${i}-06`,
    description: 'Description du projet.',
    technologies: ['Tech1', 'Tech2'],
  })),
  certifications: [
    { id: 'cert-1', name: 'AWS SAA', issuer: 'AWS', issue_date: '2022-03' },
    { id: 'cert-2', name: 'Scrum', issuer: 'Scrum.org', issue_date: '2021-07' },
  ],
  languages: [
    { name: 'Français', level: 'Natif' },
    { name: 'Anglais', level: 'B2' },
    { name: 'Espagnol', level: 'A2' },
  ],
};

export const profileFixtures = {
  complete: completeProfile,
  minimal: minimalProfile,
  dense: denseProfile,
};
