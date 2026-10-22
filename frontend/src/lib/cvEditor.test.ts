/**
 * M0-T08c — logique pure de l'éditeur de CV CANONIQUE (GeneratedCVData).
 *
 * L'éditeur travaille directement sur le schéma canonique : plus aucun pont
 * ProfileData dans le cycle load→edit→save. Ces tests prouvent les critères du
 * ticket : aucun champ affiché n'est perdu (chargement ET save), et les
 * `highlighted_skills` par expérience survivent à un cycle éditeur.
 */
import {
  CV_SAVE_MAX_SKILLS,
  createEmptyCVData,
  createEmptyCVExperience,
  createEmptyCVEducation,
  createEmptyCVProject,
  createEmptyCVCertification,
  ensureCVShape,
  skillNames,
  withSkillNames,
  sanitizeCVForSave,
  validateCVForSave,
} from '@/lib/cvEditor';
import type { components } from '@/generated/api';
import completeFixture from '../../../fixtures/cv-reference/complete.json';

type GeneratedCVData = components['schemas']['GeneratedCVData'];
type HighlightedSkill = components['schemas']['HighlightedSkill'];

const complete = completeFixture as unknown as GeneratedCVData;

/** Copie profonde : les helpers ne doivent JAMAIS muter l'état reçu. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('fabriques de cartes vides (état initial éditable)', () => {
  it('créent des entrées typées avec un id unique', () => {
    expect(createEmptyCVExperience().id).not.toBe(createEmptyCVExperience().id);
    expect(createEmptyCVExperience().highlighted_skills).toEqual([]);
    expect(createEmptyCVEducation().degree).toBe('');
    expect(createEmptyCVProject().relevant_skills).toEqual([]);
    expect(createEmptyCVCertification().issuer).toBe('');
  });

  it('createEmptyCVData produit un canonique complet et vide', () => {
    const cv = createEmptyCVData();
    expect(cv.selected_experiences).toEqual([]);
    expect(cv.highlighted_skills).toEqual([]);
    expect(cv.selected_educations).toEqual([]);
    expect(cv.selected_projects).toEqual([]);
    expect(cv.selected_certifications).toEqual([]);
    expect(cv.summary).toBe('');
    expect(cv.personal_info.first_name).toBe('');
  });
});

describe('ensureCVShape — chargement défensif (CV V1 bruts, listes absentes)', () => {
  it('entrée non-objet → CV vide éditable (pas de crash)', () => {
    expect(ensureCVShape(null).selected_experiences).toEqual([]);
    expect(ensureCVShape(undefined).summary).toBe('');
  });

  it('complète les listes absentes et normalise un CV V1 brut comme le ferait le backend', () => {
    const rawV1 = {
      personal_info: { first_name: 'Ana', last_name: 'Blanc', email: 'a@b.fr' },
      summary: 'Résumé',
      selected_experiences: [
        {
          id: 'exp-1',
          title: 'Dev',
          company: 'Acme',
          start_date: '2021-01',
          end_date: '', // V1 brut : '' = poste en cours (le backend relit '' comme null)
          description: 'D',
          highlighted_skills: ['Python', 'SQL'],
        },
      ],
      highlighted_skills: [
        { name: 'Python', level: 'Expert', category: 'Hard Skill', importance: 'Critical' },
      ],
      // selected_educations / selected_projects / selected_certifications absents
    } as unknown as GeneratedCVData;

    const shaped = ensureCVShape(clone(rawV1));
    expect(shaped.selected_educations).toEqual([]);
    expect(shaped.selected_projects).toEqual([]);
    expect(shaped.selected_certifications).toEqual([]);
    // B2 : '' = poste en cours → null (sinon la case « Poste actuel » se décoche
    // au chargement et le save est bloqué sur un état que l'utilisateur n'a pas choisi).
    expect(shaped.selected_experiences[0].end_date).toBeNull();
    // B1 : catégorie libre V1 canonicalisée à l'enum du contrat, level/importance
    // préservés (sinon la coercition backend la rabat sur 'hard_skill' au save).
    expect(shaped.highlighted_skills).toEqual([
      { name: 'Python', level: 'Expert', category: 'hard_skill', importance: 'Critical' },
    ]);
    // Le reste est transmis tel quel.
    expect(shaped.selected_experiences[0].highlighted_skills).toEqual(['Python', 'SQL']);
    expect(shaped.summary).toBe('Résumé');
  });

  it('B1 : une catégorie libre « Soft Skill » ressort soft_skill (enum canonique)', () => {
    const shaped = ensureCVShape({
      ...createEmptyCVData(),
      highlighted_skills: [
        { name: 'Communication', level: null, category: 'Soft Skill', importance: 'Important' },
      ],
    } as unknown as GeneratedCVData);
    expect(shaped.highlighted_skills[0].category).toBe('soft_skill');
  });

  it('C1 : attribue un id unique aux cartes sans id ou aux ids dupliqués', () => {
    const shaped = ensureCVShape({
      ...createEmptyCVData(),
      selected_experiences: [
        { title: 'A', company: '', start_date: '2020-01', description: '', highlighted_skills: [] },
        { id: 'exp-1', title: 'B', company: '', start_date: '2020-01', description: '', highlighted_skills: [] },
        { id: 'exp-1', title: 'C', company: '', start_date: '2020-01', description: '', highlighted_skills: [] },
      ],
    } as unknown as GeneratedCVData);
    const ids = shaped.selected_experiences.map((e) => e.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });

  it('C2 : remet à \'\' les champs requis non-chaînes (title null d\'un V1 brut)', () => {
    const shaped = ensureCVShape({
      ...createEmptyCVData(),
      selected_experiences: [
        { id: 'e1', title: null, company: null, start_date: null, description: 'x', highlighted_skills: ['S'] },
      ],
    } as unknown as GeneratedCVData);
    expect(shaped.selected_experiences[0].title).toBe('');
    expect(shaped.selected_experiences[0].company).toBe('');
    expect(shaped.selected_experiences[0].start_date).toBe('');
    // Et la validation ne crashe pas : elle bloque avec un message explicite.
    expect(validateCVForSave(shaped)[0]).toMatch(/titre ou une entreprise/);
  });

  it('est l\'identité (deep-equal) sur un canonique propre', () => {
    expect(ensureCVShape(clone(complete))).toEqual(complete);
  });
});

describe('skillNames / withSkillNames — édition de la liste plate sans perdre level/importance', () => {
  const skills = [
    { name: 'Python', level: 'Expert', category: 'hard_skill', importance: 'Critical' },
    { name: 'FastAPI', level: 'Avancé', category: 'hard_skill', importance: 'Important' },
    // Catégorie libre V1 brute : doit compter comme soft (tolérance, comme le renderer).
    { name: 'Communication', level: null, category: 'Soft Skill', importance: 'Important' },
  ] as unknown as HighlightedSkill[];

  it('skillNames scinde hard/soft avec tolérance aux catégories libres', () => {
    expect(skillNames(skills, 'hard_skill')).toEqual(['Python', 'FastAPI']);
    expect(skillNames(skills, 'soft_skill')).toEqual(['Communication']);
  });

  it('withSkillNames préserve level/importance des compétences conservées (tolérance défensive aux catégories libres — l\'app canonicalise au chargement)', () => {
    const next = withSkillNames(skills, ['Python', 'Docker'], 'hard_skill');
    const python = next.find((s) => s.name === 'Python');
    expect(python).toEqual(skills[0]); // intouché, level/importance intacts
    const docker = next.find((s) => s.name === 'Docker');
    expect(docker).toEqual({
      name: 'Docker',
      level: null,
      category: 'hard_skill',
      importance: 'Important',
    });
    // FastAPI retiré ; l'autre catégorie est intouchée (catégorie brute préservée).
    expect(next.find((s) => s.name === 'FastAPI')).toBeUndefined();
    expect(next.find((s) => s.name === 'Communication')).toEqual(skills[2]);
  });

  it('withSkillNames garde l\'ordre hard avant soft', () => {
    const next = withSkillNames(skills, ['Écoute'], 'soft_skill');
    expect(next.map((s) => s.name)).toEqual(['Python', 'FastAPI', 'Écoute']);
  });
});

describe('sanitizeCVForSave — exactement ce qui part au PUT', () => {
  it('est l\'identité (deep-equal) sur le canonique propre de référence', () => {
    expect(sanitizeCVForSave(clone(complete))).toEqual(complete);
  });

  it('écarte les cartes totalement vides (brouillons non remplis)', () => {
    const cv = createEmptyCVData();
    cv.selected_experiences = [createEmptyCVExperience()];
    cv.selected_educations = [createEmptyCVEducation()];
    cv.selected_projects = [createEmptyCVProject()];
    cv.selected_certifications = [createEmptyCVCertification()];
    const saved = sanitizeCVForSave(cv);
    expect(saved.selected_experiences).toEqual([]);
    expect(saved.selected_educations).toEqual([]);
    expect(saved.selected_projects).toEqual([]);
    expect(saved.selected_certifications).toEqual([]);
  });

  it('normalise les optionnels vides en null et préfixe https:// les URLs sans schéma', () => {
    const cv = createEmptyCVData();
    cv.personal_info = {
      ...cv.personal_info,
      first_name: 'Ana',
      last_name: 'Blanc',
      email: 'a@b.fr',
      phone: '  ',
      linkedin: 'linkedin.com/in/ana',
    };
    const proj = createEmptyCVProject();
    proj.name = 'Projet';
    proj.description = 'Desc';
    proj.url = 'github.com/ana/projet';
    proj.completion_date = '';
    cv.selected_projects = [proj];
    const cert = createEmptyCVCertification();
    cert.name = 'Cert';
    cert.issuer = 'Org';
    cert.url = 'credential.net/x';
    cv.selected_certifications = [cert];

    const saved = sanitizeCVForSave(cv);
    expect(saved.personal_info.phone).toBeNull();
    expect(saved.personal_info.linkedin).toBe('https://linkedin.com/in/ana');
    expect(saved.selected_projects[0].url).toBe('https://github.com/ana/projet');
    expect(saved.selected_projects[0].completion_date).toBeNull();
    expect(saved.selected_certifications[0].url).toBe('https://credential.net/x');
    expect(saved.selected_certifications[0].issue_date).toBeNull();
  });

  it('retire les compétences par expérience vides et ne renvoie JAMAIS optimization_notes (BLK-5)', () => {
    const cv = clone(complete);
    cv.selected_experiences[0].highlighted_skills = ['Python', '', '  '];
    (cv as Record<string, unknown>).optimization_notes = 'notes internes';
    const saved = sanitizeCVForSave(cv);
    expect(saved.selected_experiences[0].highlighted_skills).toEqual(['Python']);
    expect('optimization_notes' in saved).toBe(false);
  });
});

describe('validateCVForSave — bloque les pertes silencieuses (parité M0-T08a, canonique)', () => {
  it('[] sur le canonique propre de référence', () => {
    expect(validateCVForSave(complete)).toEqual([]);
  });

  it('bloque une expérience avec contenu mais sans titre ni entreprise', () => {
    const cv = createEmptyCVData();
    const exp = createEmptyCVExperience();
    exp.description = 'Du contenu réel';
    cv.selected_experiences = [exp];
    expect(validateCVForSave(cv)[0]).toMatch(/titre ou une entreprise/);
  });

  it('ignore une carte expérience totalement vide', () => {
    const cv = createEmptyCVData();
    cv.selected_experiences = [createEmptyCVExperience()];
    expect(validateCVForSave(cv)).toEqual([]);
  });

  it('exige une date de début AAAA-MM sur toute expérience nommée', () => {
    const cv = createEmptyCVData();
    const exp = createEmptyCVExperience();
    exp.title = 'Dev';
    exp.start_date = '2021';
    cv.selected_experiences = [exp];
    expect(validateCVForSave(cv)[0]).toMatch(/date de début/);
  });

  it('bloque une date de fin vide (ni « Poste actuel » ni AAAA-MM) — sinon relue comme poste en cours', () => {
    const cv = createEmptyCVData();
    const exp = createEmptyCVExperience();
    exp.title = 'Dev';
    exp.start_date = '2020-02';
    exp.end_date = '';
    cv.selected_experiences = [exp];
    expect(validateCVForSave(cv)[0]).toMatch(/date de fin|Poste actuel/);
    // null = poste en cours : valide.
    exp.end_date = null;
    expect(validateCVForSave(cv)).toEqual([]);
    // Mois valide : valide.
    exp.end_date = '2023-11';
    expect(validateCVForSave(cv)).toEqual([]);
  });

  it(`accepte ${CV_SAVE_MAX_SKILLS} compétences, bloque au-delà (troncature backend)`, () => {
    const mk = (n: number): HighlightedSkill[] =>
      Array.from({ length: n }, (_, i) => ({
        name: `S${i}`,
        level: null,
        category: 'hard_skill' as const,
        importance: 'Important' as const,
      }));
    const cv = createEmptyCVData();
    cv.highlighted_skills = mk(CV_SAVE_MAX_SKILLS);
    expect(validateCVForSave(cv)).toEqual([]);
    cv.highlighted_skills = mk(CV_SAVE_MAX_SKILLS + 5);
    expect(validateCVForSave(cv)[0]).toMatch(/compétences/);
  });
});

describe('validateCVForSave — parité avec les règles d\'éviction backend (revue T08c, C3)', () => {
  it('bloque un projet avec du contenu mais sans nom (le backend l\'écarte en silence)', () => {
    const cv = createEmptyCVData();
    const proj = createEmptyCVProject();
    proj.description = 'Un vrai contenu';
    cv.selected_projects = [proj];
    expect(validateCVForSave(cv)[0]).toMatch(/projet.*nom/i);
  });

  it('bloque une certification avec un organisme mais sans nom', () => {
    const cv = createEmptyCVData();
    const cert = createEmptyCVCertification();
    cert.issuer = 'Google Cloud';
    cv.selected_certifications = [cert];
    expect(validateCVForSave(cv)[0]).toMatch(/certification.*nom/i);
  });

  it('bloque une formation à description seule (sans diplôme ni établissement)', () => {
    const cv = createEmptyCVData();
    const edu = createEmptyCVEducation();
    edu.description = 'Spécialisation systèmes';
    cv.selected_educations = [edu];
    expect(validateCVForSave(cv)[0]).toMatch(/formation.*diplôme|diplôme.*établissement/i);
  });

  it('une carte remplie seulement de dates n\'est PAS traitée comme vide : bloquée, pas écartée', () => {
    const cv = createEmptyCVData();
    const exp = createEmptyCVExperience();
    exp.start_date = '2020-01'; // seule une date est saisie
    cv.selected_experiences = [exp];
    expect(validateCVForSave(cv)[0]).toMatch(/titre ou une entreprise/);
    // Et sanitize ne la supprime pas en silence.
    expect(sanitizeCVForSave(cv).selected_experiences).toHaveLength(1);
  });

  it('bloque une liste de plus de 30 éléments (le backend tronque en silence)', () => {
    const cv = createEmptyCVData();
    cv.selected_experiences = Array.from({ length: 31 }, (_, i) => ({
      ...createEmptyCVExperience(),
      title: `Poste ${i}`,
      start_date: '2020-01',
      end_date: null,
    }));
    expect(validateCVForSave(cv).some((p) => /30/.test(p))).toBe(true);
  });

  it('bloque plus de 30 compétences sur une expérience ou un projet (troncature backend)', () => {
    const cv = createEmptyCVData();
    const exp = createEmptyCVExperience();
    exp.title = 'Dev';
    exp.start_date = '2020-01';
    exp.end_date = null;
    exp.highlighted_skills = Array.from({ length: 31 }, (_, i) => `S${i}`);
    cv.selected_experiences = [exp];
    expect(validateCVForSave(cv).some((p) => /compétences/.test(p) && /30/.test(p))).toBe(true);
  });
});

describe('sanitizeCVForSave — durcissements revue T08c', () => {
  it('C5 : dédoublonne les compétences par expérience/projet sans tenir compte de la casse (le backend le ferait en silence)', () => {
    const cv = clone(complete);
    cv.selected_experiences[0].highlighted_skills = ['React', 'react', 'Python'];
    cv.selected_projects[0].relevant_skills = ['GTFS', 'gtfs'];
    const saved = sanitizeCVForSave(cv);
    expect(saved.selected_experiences[0].highlighted_skills).toEqual(['React', 'Python']);
    expect(saved.selected_projects[0].relevant_skills).toEqual(['GTFS']);
  });

  it('S-sec2 : optUrl fige le traitement des URLs hostiles (préfixe https:// = inerte, jamais de schéma dangereux)', () => {
    const cv = createEmptyCVData();
    const mkProj = (url: string) => ({ ...createEmptyCVProject(), name: 'P', description: 'D', url });
    cv.selected_projects = [
      mkProj('javascript:alert(1)'),
      mkProj('data:text/html,<script>x</script>'),
      mkProj('JaVaScRiPt:alert(1)'),
      mkProj('HTTPS://exemple.fr'),
    ];
    const urls = sanitizeCVForSave(cv).selected_projects.map((p) => p.url);
    expect(urls).toEqual([
      'https://javascript:alert(1)',
      'https://data:text/html,<script>x</script>',
      'https://JaVaScRiPt:alert(1)',
      'HTTPS://exemple.fr',
    ]);
    for (const u of urls) expect(/^https?:\/\//i.test(u as string)).toBe(true);
  });
});

describe('CYCLE V1 BRUT — le test qui manquait (revue T08c, S6) : load → save → coercition backend simulée', () => {
  it('un CV V1 brut traverse le cycle sans qu\'aucun champ ne change de sens après coercition', () => {
    const rawV1 = {
      personal_info: { first_name: 'Ana', last_name: 'Blanc', email: 'a@b.fr' },
      summary: 'Résumé',
      selected_experiences: [
        {
          // pas d'id
          title: 'Dev',
          company: 'Acme',
          start_date: '2021-01',
          end_date: '', // poste en cours au sens backend
          description: 'D',
          highlighted_skills: ['Python'],
        },
      ],
      highlighted_skills: [
        { name: 'Python', level: 'Expert', category: 'Hard Skill', importance: 'Critical' },
        { name: 'Communication', level: null, category: 'Soft Skill', importance: 'Important' },
      ],
    } as unknown as GeneratedCVData;

    // Load → save sans AUCUNE modification de l'utilisateur.
    const payload = sanitizeCVForSave(ensureCVShape(clone(rawV1)));

    // Simulation de la coercition backend sur le payload : enums rabattus à une
    // valeur sûre si inconnus, dates invalides → null. Si le payload est déjà
    // canonique, la coercition est un no-op : rien ne bascule après la resync.
    const coerced = {
      ...payload,
      selected_experiences: payload.selected_experiences.map((e) => ({
        ...e,
        end_date: e.end_date && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(e.end_date) ? e.end_date : null,
      })),
      highlighted_skills: payload.highlighted_skills.map((s) => ({
        ...s,
        category: (['hard_skill', 'soft_skill'] as const).includes(s.category) ? s.category : 'hard_skill',
      })),
    };
    expect(coerced).toEqual(payload); // la coercition ne change RIEN (no-op)

    // Le sens est préservé : poste en cours, soft reste soft, level/importance intacts.
    expect(payload.selected_experiences[0].end_date).toBeNull();
    expect(payload.highlighted_skills).toContainEqual({
      name: 'Communication', level: null, category: 'soft_skill', importance: 'Important',
    });
    expect(payload.highlighted_skills).toContainEqual({
      name: 'Python', level: 'Expert', category: 'hard_skill', importance: 'Critical',
    });
    // Et la validation laisse passer ce CV légitime sans intervention manuelle.
    expect(validateCVForSave(ensureCVShape(clone(rawV1)))).toEqual([]);
  });
});

describe('CYCLE ÉDITEUR — critère M0-T08c : rien ne se perd', () => {
  it('load (ensureCVShape) → édition des compétences plates → save (sanitize) : les highlighted_skills PAR EXPÉRIENCE et level/importance survivent', () => {
    // Chargement.
    const state = ensureCVShape(clone(complete));
    // Édition : l'utilisateur ajoute une compétence technique via le champ à tags.
    const hard = skillNames(state.highlighted_skills, 'hard_skill');
    state.highlighted_skills = withSkillNames(
      state.highlighted_skills,
      [...hard, 'Terraform'],
      'hard_skill',
    );
    // Save.
    const saved = sanitizeCVForSave(state);

    // Les compétences par expérience de l'agent sont INTACTES (perdues avant T08c).
    expect(saved.selected_experiences.map((e) => e.highlighted_skills)).toEqual(
      complete.selected_experiences.map((e) => e.highlighted_skills),
    );
    // Les level/importance des compétences non touchées sont INTACTS.
    for (const original of complete.highlighted_skills) {
      expect(saved.highlighted_skills).toContainEqual(original);
    }
    // La nouvelle compétence est là, avec les défauts sûrs.
    expect(saved.highlighted_skills).toContainEqual({
      name: 'Terraform',
      level: null,
      category: 'hard_skill',
      importance: 'Important',
    });
    // Et tout le reste du document est inchangé.
    expect(saved.selected_educations).toEqual(complete.selected_educations);
    expect(saved.selected_projects).toEqual(complete.selected_projects);
    expect(saved.selected_certifications).toEqual(complete.selected_certifications);
    expect(saved.personal_info).toEqual(complete.personal_info);
    expect(saved.summary).toBe(complete.summary);
  });
});
