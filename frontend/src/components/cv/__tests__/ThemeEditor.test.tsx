/**
 * M3-T09 — ThemeEditor : éditeur de thème CV (couleurs + polices en allowlist).
 * L'autorité de validation reste le serveur (theme_validation.py, M1-T09) ; ce
 * composant refuse tôt un hex invalide (ergonomie) et ferme le choix de police
 * sur l'allowlist (hors liste structurellement impossible + garde runtime).
 */
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeEditor from '@/components/cv/ThemeEditor';
import type { components } from '@/generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

// Factory hoistée au-dessus des imports : le tableau doit être INLINE (une
// référence externe serait encore en TDZ au moment de l'exécution). Le package
// réel n'est pas chargé (son index tire les templates + CSS, inutiles ici).
jest.mock('@talentious/cv-render', () => ({
  CV_FONT_FAMILIES: [
    'Inter',
    'Source Sans 3',
    'IBM Plex Sans',
    'Work Sans',
    'Source Serif 4',
    'Lora',
    'Merriweather',
    'IBM Plex Serif',
  ],
}));

// Source UNIQUE de l'allowlist pour les assertions : l'objet rendu par la
// factory du mock (pas de seconde copie qui pourrait dériver).
const { CV_FONT_FAMILIES: FONTS } = jest.requireMock('@talentious/cv-render') as {
  CV_FONT_FAMILIES: string[];
};

const BASE_TOKENS: CVThemeTokens = {
  color_accent: '#2D3748',
  color_text: '#1A202C',
  color_muted: '#4A5568',
  color_background: '#FFFFFF',
  font_heading: 'Inter',
  font_body: 'Inter',
};

function renderEditor(
  overrides: Partial<ComponentProps<typeof ThemeEditor>> = {},
) {
  const onChange = jest.fn();
  render(<ThemeEditor tokens={BASE_TOKENS} onChange={onChange} {...overrides} />);
  return { onChange };
}

describe('ThemeEditor — M3-T09 (éditeur de thème)', () => {
  it("refuse un hex invalide tapé : signale l'erreur et ne propage pas", async () => {
    const { onChange } = renderEditor();
    const input = screen.getByLabelText('Couleur du texte');

    await userEvent.clear(input);
    await userEvent.type(input, 'rouge');

    // Aucun hex valide tapé : le parent ne reçoit JAMAIS une valeur invalide.
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('#RRGGBB');
  });

  it.each([
    ['#12345', 'trop court'],
    ['#1234567', 'trop long'],
    ['#GGGGGG', 'hors hexadécimal'],
    ['FFFFFF', 'sans dièse'],
    ['#fff;}body{color:red', 'injection CSS'],
  ])('rejette %s (%s) en un coup, sans propager', (value) => {
    const { onChange } = renderEditor();
    const input = screen.getByLabelText('Couleur du texte');

    // En un coup (pas caractère par caractère) : aucun état valide transitoire.
    fireEvent.change(input, { target: { value } });

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('accepte un hex valide : un seul onChange, valeur normalisée en majuscules', async () => {
    const { onChange } = renderEditor();
    const input = screen.getByLabelText("Couleur d'accent");

    await userEvent.clear(input);
    await userEvent.type(input, '#12cdef');

    // Un unique appel : seul le 7e caractère forme un hex valide.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...BASE_TOKENS,
      color_accent: '#12CDEF',
    });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("récupère après erreur : un hex valide efface l'alerte et propage", () => {
    const { onChange } = renderEditor();
    const input = screen.getByLabelText('Couleur de fond');

    fireEvent.change(input, { target: { value: 'nope' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '#ABCDEF' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(onChange).toHaveBeenCalledWith({
      ...BASE_TOKENS,
      color_background: '#ABCDEF',
    });
  });

  it("police hors liste impossible : le select n'expose QUE l'allowlist", () => {
    renderEditor();
    const select = screen.getByLabelText('Police des titres') as HTMLSelectElement;

    expect(Array.from(select.options).map((o) => o.value)).toEqual(FONTS);
    // Choix fermé : un <select>, pas une saisie libre.
    expect(select.tagName).toBe('SELECT');
  });

  it('ignore une police forgée hors allowlist (garde runtime)', () => {
    const { onChange } = renderEditor();
    const select = screen.getByLabelText('Police des titres');

    // Valeur hors <option> : le handler doit l'ignorer, rien ne remonte.
    fireEvent.change(select, { target: { value: 'Comic Sans MS; }' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("choisir une police appelle onChange avec une famille de l'allowlist", async () => {
    const { onChange } = renderEditor();
    const select = screen.getByLabelText('Police du texte courant');

    await userEvent.selectOptions(select, 'Lora');

    expect(onChange).toHaveBeenCalledWith({ ...BASE_TOKENS, font_body: 'Lora' });
  });

  it('resynchronise un champ quand le parent change les tokens de l\'extérieur', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <ThemeEditor tokens={BASE_TOKENS} onChange={onChange} />,
    );
    const input = screen.getByLabelText('Couleur du texte') as HTMLInputElement;
    expect(input.value).toBe('#1A202C');

    // Le parent remplace les tokens (reset / changement de document).
    rerender(
      <ThemeEditor
        tokens={{ ...BASE_TOKENS, color_text: '#0F0F0F' }}
        onChange={onChange}
      />,
    );
    expect(input.value).toBe('#0F0F0F');
  });

  it('une resync efface une erreur de saisie en cours sur ce champ', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <ThemeEditor tokens={BASE_TOKENS} onChange={onChange} />,
    );
    const input = screen.getByLabelText('Couleur du texte') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'oops' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ThemeEditor
        tokens={{ ...BASE_TOKENS, color_text: '#0F0F0F' }}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.value).toBe('#0F0F0F');
  });

  it('désactive tous les champs quand disabled (texte, pastille, police)', () => {
    renderEditor({ disabled: true });

    expect(screen.getByLabelText('Couleur du texte')).toBeDisabled();
    expect(screen.getByLabelText('Couleur du texte (pastille)')).toBeDisabled();
    expect(screen.getByLabelText('Police des titres')).toBeDisabled();
  });
});
