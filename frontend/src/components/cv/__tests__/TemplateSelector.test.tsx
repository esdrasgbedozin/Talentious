/**
 * M3-T08 inc.2 — TemplateSelector : aperçu rendu PAR LE PACKAGE, badge
 * Gratuit/Premium visible AVANT l'action, sélection via radios natifs.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TemplateSelector from '@/components/cv/TemplateSelector';
import type { CVTemplate } from '@/lib/api';
import { createEmptyCVData } from '@/lib/cvEditor';

// L'aperçu doit passer par le registre du package (invariant « aperçu = PDF ») :
// on remplace getTemplate par une sonde qui marque l'id rendu, sans charger les
// vrais templates (le test prouve le CÂBLAGE, pas le rendu d'un template donné).
jest.mock('@talentious/cv-render', () => ({
  getTemplate: jest.fn((id: string) =>
    function TemplateStub() {
      return <div data-testid={`preview-${id}`} />;
    },
  ),
}));

import { getTemplate } from '@talentious/cv-render';

const TEMPLATES: CVTemplate[] = [
  {
    id: 'modern_sobre',
    name: 'Moderne sobre',
    sector: 'modern',
    is_free: true,
    description: 'Sobre.',
    preview_url: 'https://talentious.app/templates/modern_sobre.png',
    default_theme_id: 'anthracite',
  },
  {
    id: 'tech',
    name: 'Tech',
    sector: 'tech',
    is_free: false,
    description: 'Orienté stack.',
    preview_url: 'https://talentious.app/templates/tech.png',
    default_theme_id: 'anthracite',
  },
];

function renderSelector(overrides: Record<string, unknown> = {}) {
  const onSelect = jest.fn();
  render(
    <TemplateSelector
      templates={TEMPLATES}
      selectedId="modern_sobre"
      cv={createEmptyCVData()}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { onSelect };
}

beforeEach(() => {
  (getTemplate as jest.Mock).mockClear();
});

describe('TemplateSelector — badge Gratuit/Premium', () => {
  it('pose Premium sur les non gratuits et Gratuit sur le gratuit, avant toute action', () => {
    renderSelector();

    const premium = screen.getByText('Premium');
    expect(premium).toHaveAttribute('data-badge', 'premium');
    expect(premium.closest('label')).toHaveTextContent('Tech');

    const gratuit = screen.getByText('Gratuit');
    expect(gratuit).toHaveAttribute('data-badge', 'free');
    expect(gratuit.closest('label')).toHaveTextContent('Moderne sobre');
  });
});

describe('TemplateSelector — aperçu rendu par le package', () => {
  it('rend chaque vignette via getTemplate(id) du registre partagé', () => {
    renderSelector();

    expect(getTemplate).toHaveBeenCalledWith('modern_sobre');
    expect(getTemplate).toHaveBeenCalledWith('tech');
    expect(screen.getByTestId('preview-modern_sobre')).toBeInTheDocument();
    expect(screen.getByTestId('preview-tech')).toBeInTheDocument();
  });
});

describe('TemplateSelector — sélection (groupe de radios)', () => {
  it('expose un radiogroup et reflète le template appliqué', () => {
    renderSelector();

    expect(
      screen.getByRole('group', { name: /modèle de CV/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Moderne sobre/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Tech/ })).not.toBeChecked();
  });

  it("appelle onSelect avec l'id du template choisi", async () => {
    const { onSelect } = renderSelector();

    await userEvent.click(screen.getByRole('radio', { name: /Tech/ }));

    expect(onSelect).toHaveBeenCalledWith('tech');
  });

  it("désactive toutes les options pendant l'enregistrement et marque l'option en vol (busyId)", () => {
    renderSelector({ busyId: 'tech' });

    // Désactivation GLOBALE le temps du PUT : aucun clic concurrent possible.
    expect(screen.getByRole('radio', { name: /Tech/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Moderne sobre/ })).toBeDisabled();
    // Seule l'option réellement en vol porte aria-busy.
    const busyCard = screen
      .getByRole('radio', { name: /Tech/ })
      .closest('label')!
      .querySelector('[aria-busy="true"]');
    expect(busyCard).toBeInTheDocument();
  });
});
