/**
 * M0-T08b — Le renderer consomme le schéma canonique GeneratedCVData.
 *
 * Fixtures = les 3 références partagées `fixtures/cv-reference/*.json` (M0-T01),
 * c'est-à-dire la forme réellement stockée en base (`cv_data_json`) et la charge
 * utile que l'export-service (M2) injectera telle quelle : AUCUNE transformation
 * runtime entre stockage, aperçu et PDF (ADR-CONTENT-SCHEMA). Aucun CV ne doit
 * rendre vide.
 */
import { render } from '@testing-library/react';
import { CVRenderer } from '../index';
import type { GeneratedCVData } from '../types';
import completeJson from '../../../../fixtures/cv-reference/complete.json';
import minimalJson from '../../../../fixtures/cv-reference/minimal.json';
import denseJson from '../../../../fixtures/cv-reference/dense.json';

const complete = completeJson as unknown as GeneratedCVData;
const minimal = minimalJson as unknown as GeneratedCVData;
const dense = denseJson as unknown as GeneratedCVData;

beforeAll(() => {
  // CVRenderer instancie un ResizeObserver (absent de jsdom).
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('CVRenderer — rend les fixtures canoniques GeneratedCVData (M0-T08b)', () => {
  it.each([
    ['complete', complete],
    ['minimal', minimal],
    ['dense', dense],
  ])('rend le CV « %s » sans corps vide', (_name, cv) => {
    const { container } = render(<CVRenderer cv={cv} />);
    const text = container.textContent ?? '';
    // Identité + au moins la première expérience sélectionnée : jamais vide.
    expect(text).toContain(cv.personal_info.first_name);
    expect(text).toContain(cv.selected_experiences[0].title);
    expect(text).toContain(cv.selected_experiences[0].company);
    expect(text).toContain(cv.summary);
  });

  it.each([
    ['complete', complete],
    ['minimal', minimal],
    ['dense', dense],
  ])('snapshot du CV « %s »', (_name, cv) => {
    const { container } = render(<CVRenderer cv={cv} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('mappe les sections canoniques : skills par catégorie, formation, projet, certification', () => {
    const { container } = render(<CVRenderer cv={complete} />);
    const text = container.textContent ?? '';
    // highlighted_skills scindés par catégorie (hard → Techniques, soft → Transversales).
    expect(text).toContain('Techniques');
    expect(text).toContain('Architecture distribuée'); // hard_skill
    expect(text).toContain('Transversales');
    expect(text).toContain('Communication'); // soft_skill
    expect(text).toContain('INSA Lyon'); // selected_educations
    expect(text).toContain('Observatoire open data des mobilités'); // selected_projects
    expect(text).toContain('GTFS'); // relevant_skills du projet
    expect(text).toContain('Professional Cloud Architect'); // selected_certifications
    expect(text).toContain('Google Cloud');
  });

  it('end_date null ⇒ poste en cours (« aujourd\'hui »)', () => {
    const { container } = render(<CVRenderer cv={complete} />);
    const text = container.textContent ?? '';
    expect(text).toContain("mars 2021 — aujourd'hui");
    // L'expérience terminée garde ses deux dates.
    expect(text).toContain('janv. 2018 — févr. 2021');
  });

  it('affiche les compétences par expérience (highlighted_skills de l\'agent)', () => {
    const { container } = render(<CVRenderer cv={complete} />);
    // exp-1 : ["Python", "FastAPI", "PostgreSQL", "Observabilité"] — rendu en ligne.
    expect(container.textContent).toContain('Observabilité');
  });

  it('ne rend JAMAIS optimization_notes (champ interne, BLK-5) — ni en texte ni en balisage', () => {
    const hostile = {
      ...complete,
      optimization_notes: 'NOTE-INTERNE-NE-JAMAIS-AFFICHER',
    } as GeneratedCVData;
    const { container } = render(<CVRenderer cv={hostile} />);
    expect(container.textContent).not.toContain('NOTE-INTERNE-NE-JAMAIS-AFFICHER');
    expect(container.innerHTML).not.toContain('NOTE-INTERNE-NE-JAMAIS-AFFICHER');
  });

  it('pas de section Langues, même si une clé languages traîne dans le payload', () => {
    const withLanguages = {
      ...complete,
      languages: [{ name: 'AngolaisTest', level: 'C1' }],
    } as unknown as GeneratedCVData;
    const { container } = render(<CVRenderer cv={withLanguages} />);
    expect(container.textContent).not.toContain('Langues');
    expect(container.textContent).not.toContain('AngolaisTest');
  });
});

/**
 * CV « agent V1 brut » : stocké AVANT la ceinture de coercition (1792cda).
 * Clés canoniques présentes (⇒ passthrough de toCanonicalCVData) mais types,
 * enums et listes non garantis. Le renderer doit rester tolérant : defense in
 * depth — en M2 l'export-service re-validera le payload avant Chromium.
 */
const rawV1 = {
  personal_info: { first_name: 'Léo', last_name: 'Ancien', email: 'leo.ancien@example.com' },
  summary: 'CV historique stocké brut, avant coercition.',
  selected_experiences: [
    {
      id: 'exp-1',
      title: 'Consultant',
      company: 'OldCorp',
      start_date: '2019-05',
      end_date: '', // '' au lieu de null : doit rester « poste en cours »
      description: 'Mission longue.',
      // highlighted_skills ABSENT : ne doit pas faire planter le rendu
    },
  ],
  highlighted_skills: [
    { name: 'Python', category: 'Hard Skill', importance: 'High' },
    { name: 'Écoute active', category: 'Soft Skill' },
  ],
  selected_educations: [{ id: 'edu-1', degree: 'BTS SIO', institution: 'Lycée Monge' }],
  selected_projects: [
    { id: 'proj-1', name: 'Projet V1', description: 'Desc.' }, // relevant_skills ABSENT
  ],
  selected_certifications: [],
} as unknown as GeneratedCVData;

describe('CVRenderer — tolérance aux CV V1 stockés bruts (revue T08b, B1)', () => {
  it('rend sans planter malgré les listes par-expérience/projet absentes', () => {
    const { container } = render(<CVRenderer cv={rawV1} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Consultant');
    expect(text).toContain('Projet V1');
  });

  it('catégories libres (« Hard Skill »/« Soft Skill ») : les compétences restent affichées', () => {
    const { container } = render(<CVRenderer cv={rawV1} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Techniques');
    expect(text).toContain('Python');
    expect(text).toContain('Transversales');
    expect(text).toContain('Écoute active');
  });

  it('end_date vide ("") = poste en cours (« aujourd\'hui »)', () => {
    const { container } = render(<CVRenderer cv={rawV1} />);
    expect(container.textContent).toContain("aujourd'hui");
  });
});

describe('CVRenderer — contenu hostile échappé (préparation rendu serveur M2)', () => {
  it('échappe tout : aucun élément script/img/b créé, texte littéral rendu', () => {
    const hostile = {
      ...complete,
      summary: 'Avant <script>alert(1)</script> après',
      selected_experiences: [
        {
          ...complete.selected_experiences[0],
          description: '<img src=x onerror=alert(1)>',
          highlighted_skills: ['<b>gras</b>'],
        },
      ],
    } as GeneratedCVData;
    const { container } = render(<CVRenderer cv={hostile} />);
    expect(container.querySelector('script, img, b')).toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('<script>alert(1)</script>');
    expect(text).toContain('<img src=x onerror=alert(1)>');
    expect(text).toContain('<b>gras</b>');
  });

  it('aucun lien généré, même avec des URLs javascript:', () => {
    const withUrls = {
      ...complete,
      personal_info: { ...complete.personal_info, linkedin: 'javascript:alert(1)' },
      selected_projects: [
        { ...(complete.selected_projects ?? [])[0], url: 'javascript:alert(2)' },
      ],
      selected_certifications: [
        { ...(complete.selected_certifications ?? [])[0], url: 'javascript:alert(3)' },
      ],
    } as GeneratedCVData;
    const { container } = render(<CVRenderer cv={withUrls} />);
    expect(container.querySelector('a, [href]')).toBeNull();
  });
});

describe('CVRenderer — fit-to-page (réduction d\'échelle, repris de M0-T08)', () => {
  let original: PropertyDescriptor | undefined;

  beforeAll(() => {
    original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 2400, // > hauteur A4 utile (~1017px) ⇒ scale plafonné à MIN_SCALE
    });
  });

  afterAll(() => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original);
    } else {
      delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight;
    }
  });

  it('applique un transform: scale(<1) quand le contenu déborde', () => {
    const { container } = render(<CVRenderer cv={dense} />);
    const scaled = container.querySelector<HTMLElement>('[style*="scale"]');
    expect(scaled).not.toBeNull();
    const match = /scale\(([0-9.]+)\)/.exec(scaled!.style.transform);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThan(1);
  });
});
