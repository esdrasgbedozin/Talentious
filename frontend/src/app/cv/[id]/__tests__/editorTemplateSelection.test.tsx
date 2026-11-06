/**
 * M3-T08 inc.3 — l'éditeur câble le sélecteur de Template : une sélection appelle
 * le PUT d'enveloppe { template_id } ; un refus (ex. premium 402) ne bascule PAS
 * la sélection et affiche un message tutoyé.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import type { GeneratedCVData } from '@talentious/cv-render';
import type { CVDetail } from '@/lib/api';
import completeFixture from '../../../../../../fixtures/cv-reference/complete.json';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cv-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/components/Navbar', () => ({ __esModule: true, default: () => null }));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

// Templates stubés : on teste le CÂBLAGE (fetch + PUT + bascule), pas le rendu
// d'un template réel (couvert côté package).
jest.mock('@talentious/cv-render', () => {
  const actual = jest.requireActual('@talentious/cv-render');
  return {
    ...actual,
    getTemplate: jest.fn(() => function TemplateStub() {
      return <div data-testid="tpl" />;
    }),
  };
});

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getCV: jest.fn(),
  updateCV: jest.fn(),
  getCVTemplates: jest.fn(),
}));

import { getCV, updateCV, getCVTemplates, type CVTemplate } from '@/lib/api';
import CVEditorPage from '../edit/page';

const getCVMock = getCV as jest.MockedFunction<typeof getCV>;
const updateCVMock = updateCV as jest.MockedFunction<typeof updateCV>;
const getCVTemplatesMock = getCVTemplates as jest.MockedFunction<
  typeof getCVTemplates
>;

function cvDetail(templateId: string): CVDetail {
  return {
    id: 'cv-1',
    cv_name: 'CV Camille',
    template_id: templateId,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    job_offer_context: null,
    cv_data_json: completeFixture as unknown as GeneratedCVData,
  };
}

const CATALOG: CVTemplate[] = [
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

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  getCVMock.mockReset().mockResolvedValue(cvDetail('modern_sobre'));
  updateCVMock.mockReset().mockResolvedValue(cvDetail('tech'));
  getCVTemplatesMock.mockReset().mockResolvedValue(CATALOG);
});

describe('M3-T08 inc.3 — sélection de Template dans l éditeur', () => {
  it('appelle le PUT d enveloppe { template_id } et bascule la sélection', async () => {
    render(<CVEditorPage />);

    const tech = await screen.findByRole('radio', { name: /Tech/ });
    await userEvent.click(tech);

    expect(updateCVMock).toHaveBeenCalledWith('cv-1', { template_id: 'tech' });
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Tech/ })).toBeChecked(),
    );
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('ne bascule PAS la sélection et affiche un message si le PUT échoue (premium 402)', async () => {
    updateCVMock.mockReset().mockRejectedValue(
      new axios.AxiosError('Payment Required', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 402,
        data: { type: 'https://talentious.fr/errors/premium-template-required' },
      } as never),
    );

    render(<CVEditorPage />);

    const tech = await screen.findByRole('radio', { name: /Tech/ });
    await userEvent.click(tech);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Ce modèle est réservé aux détenteurs d'un pass actif.",
      ),
    );
    // La sélection reste sur le template chargé : le refus ne change rien.
    expect(screen.getByRole('radio', { name: /Moderne sobre/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Tech/ })).not.toBeChecked();
  });
});
