/**
 * M3-T12 — mode LECTURE SEULE (is_editable=false, décision D1) : l'édition est
 * désactivée (nom, champs, sélecteur, thème, sauvegarde), MAIS le téléchargement
 * (Aperçu / PDF) reste accessible et sans confirmation. Le serveur reste
 * l'autorité (402 à l'écriture). Défaut éditable si le champ manque.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import CVEditorPage from '../edit/page';
import type { CVDetail, CVTemplate, CVTheme } from '@/lib/api';
import type { GeneratedCVData } from '@talentious/cv-render';
import completeFixture from '../../../../../../fixtures/cv-reference/complete.json';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cv-1' }),
  useRouter: () => ({ push, back: jest.fn() }),
}));

jest.mock('@/components/Navbar', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('@talentious/cv-render', () => {
  const actual = jest.requireActual('@talentious/cv-render');
  return {
    ...actual,
    getTemplate: () =>
      function TemplateStub() {
        return <div data-testid="preview" />;
      },
  };
});

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    getCV: jest.fn(),
    updateCV: jest.fn(),
    getCVTemplates: jest.fn(),
  };
});

import { getCV, updateCV, getCVTemplates } from '@/lib/api';
const getCVMock = getCV as jest.Mock;
const updateCVMock = updateCV as jest.Mock;
const getCVTemplatesMock = getCVTemplates as jest.Mock;

const THEME: CVTheme = {
  id: 'anthracite',
  name: 'Anthracite',
  tokens: {
    color_accent: '#2D3748',
    color_text: '#1A202C',
    color_muted: '#4A5568',
    color_background: '#FFFFFF',
    font_heading: 'Inter',
    font_body: 'Inter',
  },
  is_free: true,
};

function cvDetail(isEditable: boolean): CVDetail {
  return {
    id: 'cv-1',
    cv_name: 'CV Camille',
    template_id: 'modern_sobre',
    language: 'fr',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    job_offer_context: null,
    cv_data_json: completeFixture as unknown as GeneratedCVData,
    theme: THEME,
    is_editable: isEditable,
  };
}

const CATALOG: CVTemplate[] = [
  {
    id: 'modern_sobre',
    name: 'Moderne sobre',
    is_free: true,
    default_theme_id: 'anthracite',
  } as CVTemplate,
];

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});

beforeEach(() => {
  push.mockReset();
  updateCVMock.mockReset().mockResolvedValue(cvDetail(true));
  getCVTemplatesMock.mockReset().mockResolvedValue(CATALOG);
});

describe('M3-T12 — lecture seule (is_editable=false)', () => {
  it("désactive toute l'édition mais garde le téléchargement", async () => {
    getCVMock.mockReset().mockResolvedValue(cvDetail(false));
    const confirmSpy = jest.spyOn(window, 'confirm');
    render(<CVEditorPage />);

    await screen.findByText('Ce CV est en lecture seule.');

    // Édition verrouillée de bout en bout.
    expect(screen.getByLabelText('Nom du CV')).toBeDisabled();
    expect(screen.getByLabelText('Prénom')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Moderne sobre/ })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Enregistrer le thème/i }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Couleur d'accent")).toBeDisabled();
    // Section de contenu dépliée en lecture seule (consultable), bouton grisé.
    expect(
      screen.getByRole('button', { name: /Ajouter une expérience/i }),
    ).toBeDisabled();

    // Téléchargement TOUJOURS possible, sans confirmation (rien n'est « dirty »).
    const preview = screen.getByRole('button', { name: /Aperçu \/ PDF/i });
    expect(preview).toBeEnabled();
    fireEvent.click(preview);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/cv/cv-1/print?preview=1');
    // Aucune écriture tentée.
    expect(updateCVMock).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('un document éditable ne montre pas la bannière et laisse éditer', async () => {
    getCVMock.mockReset().mockResolvedValue(cvDetail(true));
    render(<CVEditorPage />);

    const prenom = await screen.findByLabelText('Prénom');
    expect(prenom).toBeEnabled();
    expect(screen.getByLabelText('Nom du CV')).toBeEnabled();
    expect(
      screen.queryByText('Ce CV est en lecture seule.'),
    ).not.toBeInTheDocument();
  });

  it('is_editable absent : éditable par défaut (serveur autoritatif)', async () => {
    const detail = cvDetail(true);
    delete (detail as { is_editable?: boolean }).is_editable;
    getCVMock.mockReset().mockResolvedValue(detail);
    render(<CVEditorPage />);

    const prenom = await screen.findByLabelText('Prénom');
    expect(prenom).toBeEnabled();
    expect(
      screen.queryByText('Ce CV est en lecture seule.'),
    ).not.toBeInTheDocument();
  });
});
