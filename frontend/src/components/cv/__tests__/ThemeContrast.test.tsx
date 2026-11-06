/**
 * M3-T10 — ThemeContrast : indicateur de contraste en direct. La parité de
 * l'ALGORITHME avec le serveur est couverte par themeContrast.test.ts (fixtures
 * partagées) ; ici on vérifie le RENDU : lignes, verdict, ratio, mise à jour, et
 * le fait qu'un hex invalide ne plante pas.
 */
import { render, screen, within } from '@testing-library/react';
import { contrastRatio } from '@talentious/cv-render';
import ThemeContrast from '@/components/cv/ThemeContrast';
import type { components } from '@/generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

const READABLE: CVThemeTokens = {
  color_accent: '#2D3748',
  color_text: '#1A202C',
  color_muted: '#4A5568',
  color_background: '#FFFFFF',
  font_heading: 'Inter',
  font_body: 'Inter',
};

function fieldRow(field: string): HTMLElement {
  const row = document.querySelector(`[data-field="${field}"]`);
  if (!row) throw new Error(`ligne absente pour ${field}`);
  return row as HTMLElement;
}

describe('ThemeContrast — indicateur en direct (M3-T10)', () => {
  it('affiche les 3 couleurs de premier plan avec leur verdict', () => {
    render(<ThemeContrast tokens={READABLE} />);
    const list = screen.getByRole('list', { name: 'Contraste du thème' });

    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(list).toHaveTextContent('Texte sur le fond');
    expect(list).toHaveTextContent('Accent sur le fond');
    // Palette anthracite par défaut : tout est lisible.
    rows.forEach((r) => expect(r).toHaveAttribute('data-readable', 'true'));
    expect(screen.getAllByText('Lisible')).toHaveLength(3);
  });

  it('signale une couleur illisible et montre le ratio exact calculé', () => {
    // Accent gris très clair sur fond blanc : sous le seuil 4.5.
    render(<ThemeContrast tokens={{ ...READABLE, color_accent: '#DDDDDD' }} />);

    const accent = fieldRow('color_accent');
    expect(accent).toHaveAttribute('data-readable', 'false');
    expect(accent).toHaveTextContent('Contraste insuffisant');
    // Ratio exact = celui du package (pas une valeur magique).
    expect(accent).toHaveTextContent(
      contrastRatio('#DDDDDD', '#FFFFFF').toFixed(2),
    );
    expect(fieldRow('color_text')).toHaveAttribute('data-readable', 'true');
  });

  it('ne plante pas sur un hex invalide : affiche « Couleur invalide » / n/a', () => {
    // Saisie partielle / donnée corrompue : le rendu doit tenir.
    render(<ThemeContrast tokens={{ ...READABLE, color_text: '#12' }} />);

    const text = fieldRow('color_text');
    expect(text).toHaveAttribute('data-readable', 'false');
    expect(text).toHaveTextContent('Couleur invalide');
    expect(text).toHaveTextContent('n/a');
  });

  it('se met à jour quand les tokens changent (indicateur en direct)', () => {
    const { rerender } = render(<ThemeContrast tokens={READABLE} />);
    expect(fieldRow('color_text')).toHaveAttribute('data-readable', 'true');

    // Texte gris clair sur fond blanc : devient illisible.
    rerender(<ThemeContrast tokens={{ ...READABLE, color_text: '#CCCCCC' }} />);
    expect(fieldRow('color_text')).toHaveAttribute('data-readable', 'false');
  });

  it('résume l\'état pour les lecteurs d\'écran (role=status)', () => {
    render(<ThemeContrast tokens={{ ...READABLE, color_accent: '#DDDDDD' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'à corriger (Accent)',
    );
  });
});
