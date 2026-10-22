/**
 * M0-T09 — themeToCssVars : CVThemeTokens (contrat) → propriétés CSS CV-scopées.
 *
 * Le thème est un snapshot de tokens validés côté serveur, MAIS le package
 * alimente aussi Chromium (export-service, M2) : defense in depth, toute valeur
 * non strictement conforme (hex #RRGGBB, police hors liste blanche) est
 * remplacée par le défaut anthracite (D2) — jamais interpolée telle quelle
 * (anti-injection CSS, ADR-THEME-DECOUPLED).
 */
import { themeToCssVars, DEFAULT_CV_THEME_TOKENS } from './theme';
import type { components } from './generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

const valid: CVThemeTokens = {
  color_accent: '#B45309',
  color_text: '#111827',
  color_muted: '#6B7280',
  color_background: '#FFFBEB',
  font_heading: 'Lora',
  font_body: 'Source Sans 3',
};

describe('themeToCssVars — mapping contrat → variables --cv-*', () => {
  it('mappe les 6 tokens du contrat vers les 6 variables CV-scopées', () => {
    const vars = themeToCssVars(valid);
    expect(vars['--cv-accent']).toBe('#B45309');
    expect(vars['--cv-text']).toBe('#111827');
    expect(vars['--cv-muted']).toBe('#6B7280');
    expect(vars['--cv-background']).toBe('#FFFBEB');
    // Police : nom entre guillemets + pile de secours du bon registre.
    expect(vars['--cv-font-heading']).toBe('"Lora", serif');
    expect(vars['--cv-font-body']).toBe('"Source Sans 3", sans-serif');
    expect(Object.keys(vars)).toHaveLength(6);
  });

  it('sans thème (null/undefined) : le défaut anthracite quasi-monochrome (D2)', () => {
    for (const input of [null, undefined]) {
      const vars = themeToCssVars(input);
      expect(vars['--cv-accent']).toBe(DEFAULT_CV_THEME_TOKENS.color_accent);
      expect(vars['--cv-text']).toBe(DEFAULT_CV_THEME_TOKENS.color_text);
      expect(vars['--cv-background']).toBe('#FFFFFF');
      expect(vars['--cv-font-body']).toBe('"Inter", sans-serif');
    }
  });

  it('toute couleur non #RRGGBB strict retombe sur le défaut du token (anti-injection CSS)', () => {
    const hostile = themeToCssVars({
      ...valid,
      color_accent: '#fff; background:url(https://evil.example/x)',
      color_text: 'expression(alert(1))',
      color_muted: 'red',
      color_background: '#12345', // 5 hex : invalide
    });
    expect(hostile['--cv-accent']).toBe(DEFAULT_CV_THEME_TOKENS.color_accent);
    expect(hostile['--cv-text']).toBe(DEFAULT_CV_THEME_TOKENS.color_text);
    expect(hostile['--cv-muted']).toBe(DEFAULT_CV_THEME_TOKENS.color_muted);
    expect(hostile['--cv-background']).toBe(DEFAULT_CV_THEME_TOKENS.color_background);
    // Aucune valeur hostile n'est interpolée nulle part.
    for (const v of Object.values(hostile)) {
      expect(v).not.toMatch(/url|expression|evil|;/i);
    }
  });

  it('toute police hors liste blanche du contrat retombe sur le défaut (même une pile CSS valide)', () => {
    const vars = themeToCssVars({
      ...valid,
      font_heading: 'Comic Sans MS' as CVThemeTokens['font_heading'],
      font_body: 'Inter", cursive; background:url(//evil)' as CVThemeTokens['font_body'],
    });
    expect(vars['--cv-font-heading']).toBe('"Inter", sans-serif');
    expect(vars['--cv-font-body']).toBe('"Inter", sans-serif');
  });

  it('la casse et les espaces de bord ne font pas échouer une valeur légitime', () => {
    const vars = themeToCssVars({ ...valid, color_accent: ' #2d3748 ' });
    expect(vars['--cv-accent']).toBe('#2d3748');
  });
});
