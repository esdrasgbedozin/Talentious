/**
 * M0-T08a — Correctif de la perte de données au save de l'éditeur de CV.
 *
 * Bug : l'éditeur sauvegarde `cv_data_json` en ProfileData (`experiences`,
 * `skills.{hard,soft}`…) ; le backend coerce vers GeneratedCVData en ne lisant
 * QUE les clés canoniques `selected_*`/`highlighted_skills` ⇒ le corps du CV est
 * remplacé par des tableaux vides. Correctif : convertir ProfileData →
 * GeneratedCVData AU SAVE (honore le contrat `PUT /cv` = GeneratedCVData).
 *
 * Ce test prouve d'abord l'exigence (rouge : `profileToGeneratedCV` n'existe pas),
 * puis la non-perte du corps après implémentation.
 *
 * Depuis M0-T08c, l'éditeur travaille directement en canonique (voir
 * `cvEditor.test.ts`) : ce fichier teste le PONT LEGACY (lecture des CV V1
 * stockés en ProfileData), seul usage restant de ce module — résorption
 * définitive après la décision backfill (PAH-M0).
 */
import type { components } from '@/generated/api';
import { normalizeCVData, profileToGeneratedCV, toCanonicalCVData } from '@/lib/cv';
import { createEmptyProfile, type UserProfile } from '@/types/profile';

type GeneratedCVData = components['schemas']['GeneratedCVData'];

const fullProfile: UserProfile = {
  personal_info: {
    first_name: 'Alice',
    last_name: 'Martin',
    email: 'alice.martin@example.com',
    phone: '+33 6 12 34 56 78',
    linkedin: 'https://linkedin.com/in/alicemartin',
    address: '1 rue de la Paix',
    city: 'Lyon',
    postal_code: '69002',
    country: 'France',
  },
  summary: 'Ingénieure logicielle, 8 ans en systèmes distribués.',
  experiences: [
    {
      id: 'exp-1',
      title: 'Lead Backend',
      company: 'Acme',
      location: 'Lyon',
      start_date: '2021-01',
      end_date: '',
      is_current: true,
      description: 'Pilotage technique.',
      achievements: ['Réduit la latence de 40%', 'Migré vers l’événementiel'],
    },
    {
      id: 'exp-2',
      title: 'Développeuse',
      company: 'Globex',
      location: 'Paris',
      start_date: '2017-09',
      end_date: '2020-12',
      is_current: false,
      description: 'APIs à fort trafic.',
      achievements: [],
    },
  ],
  educations: [
    {
      id: 'edu-1',
      degree: 'Master Informatique',
      institution: 'INSA Lyon',
      location: 'Lyon',
      start_date: '2012-09',
      end_date: '2017-06',
      field: 'Systèmes distribués',
      description: 'Spécialisation cloud.',
      grade: 'Mention Bien',
    },
  ],
  skills: {
    hard: ['Python', 'Go', 'PostgreSQL'],
    soft: ['Leadership', 'Communication'],
  },
  languages: [{ name: 'Anglais', level: 'C1' }],
  projects: [
    {
      id: 'proj-1',
      name: 'Pipeline temps réel',
      description: 'Traitement de flux.',
      url: 'https://example.com/p',
      start_date: '2022-03',
      end_date: '2022-11',
      technologies: ['Kafka', 'Flink'],
      role: 'Architecte',
    },
  ],
  certifications: [
    {
      id: 'cert-1',
      name: 'CKA',
      issuer: 'CNCF',
      issue_date: '2023-05',
      expiration_date: '',
      credential_id: '',
      credential_url: 'https://example.com/c',
    },
  ],
};

describe('profileToGeneratedCV — non-perte du corps du CV au save (M0-T08a)', () => {
  it('préserve toutes les sections du corps (le bug les vidait)', () => {
    const g: GeneratedCVData = profileToGeneratedCV(fullProfile);

    expect(g.selected_experiences).toHaveLength(2);
    expect(g.selected_experiences[0].title).toBe('Lead Backend');
    expect(g.highlighted_skills.length).toBe(5); // 3 hard + 2 soft
    expect(g.selected_educations).toHaveLength(1);
    expect(g.selected_projects).toHaveLength(1);
    expect(g.selected_certifications).toHaveLength(1);
  });

  it('mappe skills.{hard,soft} vers highlighted_skills avec la bonne catégorie', () => {
    const g = profileToGeneratedCV(fullProfile);
    const python = g.highlighted_skills.find((s) => s.name === 'Python');
    const leadership = g.highlighted_skills.find((s) => s.name === 'Leadership');
    expect(python?.category).toBe('hard_skill');
    expect(leadership?.category).toBe('soft_skill');
  });

  it('traduit is_current en end_date null (poste en cours)', () => {
    const g = profileToGeneratedCV(fullProfile);
    expect(g.selected_experiences[0].end_date).toBeNull();
    expect(g.selected_experiences[1].end_date).toBe('2020-12');
  });

  it('plie les achievements dans la description (contenu visible non perdu)', () => {
    const g = profileToGeneratedCV(fullProfile);
    expect(g.selected_experiences[0].description).toContain('Pilotage technique.');
    expect(g.selected_experiences[0].description).toContain('Réduit la latence de 40%');
    expect(g.selected_experiences[0].description).toContain('Migré vers l’événementiel');
  });

  it('mappe les projets (relevant_skills, completion_date) et formations/certifs', () => {
    const g = profileToGeneratedCV(fullProfile);
    expect(g.selected_projects[0].relevant_skills).toEqual(['Kafka', 'Flink']);
    expect(g.selected_projects[0].completion_date).toBe('2022-11');
    expect(g.selected_educations[0].degree).toBe('Master Informatique');
    expect(g.selected_certifications[0].issuer).toBe('CNCF');
  });

  it('ne produit aucune clé hors schéma ni optimization_notes', () => {
    const g = profileToGeneratedCV(fullProfile) as Record<string, unknown>;
    const allowed = new Set([
      'personal_info',
      'summary',
      'selected_experiences',
      'highlighted_skills',
      'selected_educations',
      'selected_projects',
      'selected_certifications',
    ]);
    for (const key of Object.keys(g)) {
      expect(allowed.has(key)).toBe(true);
    }
    expect('experiences' in g).toBe(false);
    expect('optimization_notes' in g).toBe(false);
  });

  it('round-trip : normalizeCVData(profileToGeneratedCV(p)) conserve les champs supportés', () => {
    const roundTripped = normalizeCVData(profileToGeneratedCV(fullProfile));
    expect(roundTripped.experiences.map((e) => e.title)).toEqual([
      'Lead Backend',
      'Développeuse',
    ]);
    expect(roundTripped.skills.hard).toContain('Python');
    expect(roundTripped.skills.soft).toContain('Leadership');
    expect(roundTripped.educations[0].degree).toBe('Master Informatique');
    expect(roundTripped.projects[0].name).toBe('Pipeline temps réel');
    expect(roundTripped.certifications[0].name).toBe('CKA');
  });

  it('entrée vide ⇒ GeneratedCVData sûr avec les tableaux requis présents', () => {
    const g = profileToGeneratedCV(undefined as unknown as UserProfile);
    expect(g.selected_experiences).toEqual([]);
    expect(g.highlighted_skills).toEqual([]);
    expect(g.selected_educations).toEqual([]);
    expect(typeof g.summary).toBe('string');
  });

  it('POINT FIXE : profileToGeneratedCV(normalizeCVData(g)) === g (non-dérive aux cycles)', () => {
    // Le test central de stabilité éditer→enregistrer→recharger→ré-enregistrer :
    // une fois canonique, un CV ne doit plus changer d'un cycle à l'autre.
    const g1 = profileToGeneratedCV(fullProfile);
    const g2 = profileToGeneratedCV(normalizeCVData(g1));
    expect(g2).toEqual(g1);
  });

  it('préserve l\'URL d\'une certification canonique au cycle lecture→save (clé `url`)', () => {
    const g1 = profileToGeneratedCV(fullProfile);
    expect(g1.selected_certifications[0].url).toBe('https://example.com/c');
    const g2 = profileToGeneratedCV(normalizeCVData(g1));
    expect(g2.selected_certifications[0].url).toBe('https://example.com/c');
  });

  it('préfixe https:// sur les URLs sans schéma (linkedin, projet, certification)', () => {
    const p: UserProfile = {
      ...createEmptyProfile(),
      personal_info: {
        ...createEmptyProfile().personal_info,
        linkedin: 'linkedin.com/in/x',
      },
      projects: [
        {
          id: 'proj-1',
          name: 'P',
          description: '',
          url: 'example.com/p',
          start_date: '',
          end_date: '',
          technologies: [],
          role: '',
        },
      ],
      certifications: [
        {
          id: 'cert-1',
          name: 'C',
          issuer: 'I',
          issue_date: '',
          expiration_date: '',
          credential_id: '',
          credential_url: 'credential.net/x',
        },
      ],
    };
    const g = profileToGeneratedCV(p);
    expect(g.personal_info.linkedin).toBe('https://linkedin.com/in/x');
    expect(g.selected_projects[0].url).toBe('https://example.com/p');
    expect(g.selected_certifications[0].url).toBe('https://credential.net/x');
    // Idempotent : une URL déjà préfixée ne change pas.
    expect(profileToGeneratedCV(g as unknown as UserProfile)).toBeDefined();
    const gFull = profileToGeneratedCV(fullProfile);
    expect(gFull.personal_info.linkedin).toBe('https://linkedin.com/in/alicemartin');
  });

  it('achievements avec description vide ⇒ puces seules, éléments vides filtrés', () => {
    const p: UserProfile = {
      ...createEmptyProfile(),
      experiences: [
        {
          id: 'exp-1',
          title: 'Dev',
          company: 'Acme',
          location: '',
          start_date: '2021-01',
          end_date: '2022-01',
          is_current: false,
          description: '',
          achievements: ['A1', '   ', ''],
        },
      ],
    };
    const g = profileToGeneratedCV(p);
    expect(g.selected_experiences[0].description).toBe('• A1');
  });
});

describe('toCanonicalCVData — alimentation du renderer canonique (M0-T08b)', () => {
  it('passthrough STRICT quand le contenu est déjà canonique (zéro transformation)', () => {
    const canonical = {
      personal_info: { first_name: 'A', last_name: 'B', email: 'a@b.fr' },
      summary: 'S',
      selected_experiences: [
        {
          id: 'exp-1',
          title: 'Dev',
          company: 'Acme',
          start_date: '2021-01',
          end_date: null,
          description: 'D',
          // Produit par l'agent : doit survivre tel quel (normalizeCVData le perdrait).
          highlighted_skills: ['Python', 'FastAPI'],
        },
      ],
      highlighted_skills: [],
      selected_educations: [],
    };
    const out = toCanonicalCVData(canonical);
    expect(out).toBe(canonical); // même référence : aucune copie, aucune mutation
    expect(out.selected_experiences[0].highlighted_skills).toEqual(['Python', 'FastAPI']);
  });

  it('ponte un CV V1 legacy (forme ProfileData) vers le canonique', () => {
    const out = toCanonicalCVData(fullProfile);
    expect(out.selected_experiences).toHaveLength(2);
    expect(out.selected_experiences[0].title).toBe('Lead Backend');
    expect(out.highlighted_skills.length).toBe(5);
  });

  it('entrée inexploitable ⇒ canonique sûr et vide', () => {
    const out = toCanonicalCVData(null);
    expect(out.selected_experiences).toEqual([]);
    expect(out.highlighted_skills).toEqual([]);
  });
});
