/**
 * M0-T13 — i18n du renderer : critère du ticket.
 *
 * FR : snapshot identique (les 3 snapshots canoniques existants ne bougent PAS
 * — le défaut reste le FR, aucun document existant ne change de rendu).
 * EN : titres de sections et mois rendus en anglais, contenu utilisateur intact.
 */
import { render } from '@testing-library/react';
import { CVRenderer } from '../index';
import type { GeneratedCVData } from '../types';
import completeJson from '../../../../fixtures/cv-reference/complete.json';

const complete = completeJson as unknown as GeneratedCVData;

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('CVRenderer — langue de rendu (M0-T13)', () => {
  it('language="en" : titres de sections (h2 EXACTS) et mois EN, contenu utilisateur inchangé', () => {
    const { container } = render(<CVRenderer cv={complete} language="en" />);
    const text = container.textContent ?? '';
    // Titres de sections : les h2 GÉNÉRÉS, pas une occurrence fortuite dans le
    // contenu utilisateur (revue T13).
    const titles = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(titles).toEqual([
      'Summary',
      'Professional Experience',
      'Education',
      'Skills',
      'Projects',
      'Certifications',
    ]);
    // Groupes de compétences (seul usage du séparateur EN).
    expect(text).toContain('Technical skills: ');
    expect(text).toContain('Soft skills: ');
    // Mois sur TOUTES les sections datées : expériences (2021-03 en cours,
    // 2018-01 → 2021-02), formation (2017-09), projet (2022-06), certif (2023-04).
    expect(text).toContain('Mar 2021 — Present');
    expect(text).toContain('Jan 2018 — Feb 2021');
    expect(text).toContain('Sep 2017');
    expect(text).toContain('Jun 2022');
    expect(text).toContain('Apr 2023');
    // Aucun libellé FR résiduel.
    expect(text).not.toContain('Expérience professionnelle');
    expect(text).not.toContain("aujourd'hui");
    // Le CONTENU n'est pas traduit (il vient tel quel du document).
    expect(text).toContain(complete.summary);
    expect(text).toContain(complete.selected_experiences[0].title);
  });

  it('language="fr" explicite ≡ défaut (la preuve d\'identité du FR d\'AVANT T13, octet pour octet, est le snapshot canonique — CVRenderer.canonical.test.tsx, inchangé sans régénération)', () => {
    const fr = render(<CVRenderer cv={complete} />).container.innerHTML;
    const frExplicit = render(<CVRenderer cv={complete} language="fr" />).container.innerHTML;
    expect(frExplicit).toBe(fr);
    expect(fr).toContain('Expérience professionnelle');
    expect(fr).toContain("aujourd'hui");
  });

  it('dates hors format (mois 13/00, non-chaîne) : repli année ou vide, jamais de crash', () => {
    const corrupted = {
      ...complete,
      selected_experiences: [
        { ...complete.selected_experiences[0], start_date: '2020-13', end_date: '2020-00' },
        { ...complete.selected_experiences[1], start_date: { evil: true }, end_date: null },
      ],
    } as unknown as GeneratedCVData;
    const { container } = render(<CVRenderer cv={corrupted} language="en" />);
    const text = container.textContent ?? '';
    // Mois invalide : seule l'année est rendue (comportement préexistant, figé).
    expect(text).toContain('2020 — 2020');
    // Non-chaîne : vide — la plage retombe sur le seul libellé restant (Present).
    expect(text).toContain('Present');
    expect(text).not.toContain('evil');
  });

  it('language corrompu à l\'exécution (hors contrat) : repli FR, jamais de crash', () => {
    const { container } = render(
      <CVRenderer cv={complete} language={'de' as unknown as 'fr'} />,
    );
    expect(container.textContent).toContain('Expérience professionnelle');
  });
});
