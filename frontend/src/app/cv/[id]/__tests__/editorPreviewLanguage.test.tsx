/**
 * M3-T14 — l'aperçu LIVE de l'éditeur applique AUSSI la langue de l'enveloppe
 * (« aperçu = PDF »). L'aperçu live montre l'état en cours d'édition (entrée
 * nettoyée, thème/langue en état local), mais la langue CHARGÉE depuis le
 * détail doit atteindre le rendu — sinon l'aperçu diverge du PDF exporté.
 */
import { render, screen } from '@testing-library/react';
import type { GeneratedCVData, DocumentLanguage } from '@talentious/cv-render';
import type { CVDetail } from '@/lib/api';
import completeFixture from '../../../../../../fixtures/cv-reference/complete.json';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cv-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/Navbar', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getCV: jest.fn(),
  getCVTemplates: jest.fn(),
  updateCV: jest.fn(),
}));

import { getCV, getCVTemplates } from '@/lib/api';
import CVEditorPage from '../edit/page';

const getCVMock = getCV as jest.MockedFunction<typeof getCV>;
const getCVTemplatesMock = getCVTemplates as jest.MockedFunction<
  typeof getCVTemplates
>;

function cvDetail(language: DocumentLanguage): CVDetail {
  return {
    id: 'cv-1',
    cv_name: 'CV Camille',
    template_id: 'modern_sobre',
    language,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    job_offer_context: null,
    cv_data_json: completeFixture as unknown as GeneratedCVData,
    theme: {
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
    },
  };
}

beforeAll(() => {
  // CvSheet observe sa taille pour l'auto-fit (ResizeObserver absent de jsdom).
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  getCVMock.mockReset();
  // Catalogue vide : sélecteur masqué, l'aperçu reste rendu.
  getCVTemplatesMock.mockReset().mockResolvedValue([]);
});

describe("M3-T14 — langue de l'enveloppe dans l'aperçu live de l'éditeur", () => {
  it("langue EN chargée : l'aperçu live affiche les libellés anglais", async () => {
    getCVMock.mockResolvedValue(cvDetail('en'));
    render(<CVEditorPage />);
    // Les libellés de section EN ne viennent QUE du rendu <Template> de l'aperçu
    // (les formulaires d'édition ont leurs propres libellés FR).
    expect(
      await screen.findByText('Professional Experience'),
    ).toBeInTheDocument();
  });

  it('langue FR chargée : libellés français', async () => {
    getCVMock.mockResolvedValue(cvDetail('fr'));
    render(<CVEditorPage />);
    expect(
      await screen.findByText('Expérience professionnelle'),
    ).toBeInTheDocument();
  });
});
