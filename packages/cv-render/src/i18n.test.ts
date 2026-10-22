/**
 * M0-T13 — Dictionnaire i18n du renderer (FR/EN).
 *
 * `language` vient de l'ENVELOPPE du document (contrat `DocumentLanguage`,
 * « changer language met à jour la langue de RENDU, ne traduit pas le
 * contenu »). Résolution STRICTE comme le registre (ADR-TEMPLATE-REGISTRY) :
 * tout ce qui n'est pas exactement 'fr' ou 'en' retombe sur le FR — garde
 * `Object.hasOwn` par construction (leçon de la revue T11+T12).
 */
import { CV_RENDER_LOCALES, getCVLocale } from './i18n';

describe('getCVLocale — résolution stricte et repli FR', () => {
  it('résout fr et en vers leurs dictionnaires', () => {
    expect(getCVLocale('fr')).toBe(CV_RENDER_LOCALES.fr);
    expect(getCVLocale('en')).toBe(CV_RENDER_LOCALES.en);
  });

  it('tout le reste retombe sur le FR (absent, inconnu, casse, hostile, prototype)', () => {
    for (const bad of [
      undefined,
      null,
      '',
      'de',
      'FR', // casse stricte : les ids d'enveloppe sont stables, pas des saisies
      'en-US',
      42,
      { language: 'en' },
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
      Symbol('en'),
      ['en'],
    ]) {
      expect(getCVLocale(bad)).toBe(CV_RENDER_LOCALES.fr);
    }
  });
});

describe('CV_RENDER_LOCALES — immuables à l\'exécution', () => {
  it('les dictionnaires partagés sont gelés (aucune contamination possible)', () => {
    expect(Object.isFrozen(CV_RENDER_LOCALES)).toBe(true);
    for (const locale of [CV_RENDER_LOCALES.fr, CV_RENDER_LOCALES.en]) {
      expect(Object.isFrozen(locale)).toBe(true);
      expect(Object.isFrozen(locale.sections)).toBe(true);
      expect(Object.isFrozen(locale.skillGroups)).toBe(true);
      expect(Object.isFrozen(locale.months)).toBe(true);
    }
    expect(() => {
      (CV_RENDER_LOCALES.fr.sections as { profile: string }).profile = 'PWNED';
    }).toThrow(TypeError); // mode strict des modules ES : écriture gelée = throw
    expect(CV_RENDER_LOCALES.fr.sections.profile).toBe('Profil');
  });
});

describe('CV_RENDER_LOCALES — dictionnaires complets et parallèles', () => {
  it('12 mois dans chaque langue, libellés attendus', () => {
    expect(CV_RENDER_LOCALES.fr.months).toHaveLength(12);
    expect(CV_RENDER_LOCALES.en.months).toHaveLength(12);
    expect(CV_RENDER_LOCALES.fr.months[0]).toBe('janv.');
    expect(CV_RENDER_LOCALES.en.months[0]).toBe('Jan');
    expect(CV_RENDER_LOCALES.fr.present).toBe("aujourd'hui");
    expect(CV_RENDER_LOCALES.en.present).toBe('Present');
  });

  it('mêmes clés de sections dans les deux langues (aucun trou silencieux)', () => {
    expect(Object.keys(CV_RENDER_LOCALES.en.sections).sort()).toEqual(
      Object.keys(CV_RENDER_LOCALES.fr.sections).sort(),
    );
    expect(CV_RENDER_LOCALES.fr.sections.experience).toBe('Expérience professionnelle');
    expect(CV_RENDER_LOCALES.en.sections.experience).toBe('Professional Experience');
  });
});
