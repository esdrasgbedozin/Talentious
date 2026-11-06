/**
 * M3-T14 — Invariant « aperçu = PDF ». La page print est l'« Aperçu »
 * AUTORITAIRE (le bouton Aperçu de l'éditeur y route) ET le miroir de ce que
 * l'export-service produit. Elle doit donc rendre le CV avec le MÊME payload de
 * forme que l'export : le THÈME et la LANGUE de l'enveloppe, sur les 4 templates
 * du registre. Avant ce câblage, elle rendait `<Template cv={...} />` seul —
 * thème anthracite par défaut, langue française — pendant que le PDF honorait le
 * thème custom et la langue stockés : aperçu != PDF pour tout document premium.
 *
 * Preuve : avec un thème custom + langue EN dans l'enveloppe, la feuille rendue
 * porte la variable CSS du thème (même injection que l'export, via CvSheet) ET
 * les libellés anglais du registre — pour CHAQUE template.
 */
import { render, screen } from '@testing-library/react';
import type { GeneratedCVData } from '@talentious/cv-render';
import { TEMPLATE_IDS } from '@talentious/cv-render';
import type { CVDetail, DocumentLanguage } from '@/lib/api';
import completeFixture from '../../../../../../fixtures/cv-reference/complete.json';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cv-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getCV: jest.fn(),
}));

import { getCV } from '@/lib/api';
import CVPrintPage from '../print/page';

const getCVMock = getCV as jest.MockedFunction<typeof getCV>;

// Accent hors anthracite par défaut : prouve que c'est bien le thème de
// l'ENVELOPPE qui est appliqué, pas un repli.
const CUSTOM_ACCENT = '#BADA55';

function cvDetail(templateId: string, language: DocumentLanguage): CVDetail {
  return {
    id: 'cv-1',
    cv_name: 'CV Camille',
    template_id: templateId,
    language,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    job_offer_context: null,
    cv_data_json: completeFixture as unknown as GeneratedCVData,
    theme: {
      id: null,
      name: 'Personnalisé',
      tokens: {
        color_accent: CUSTOM_ACCENT,
        color_text: '#1A202C',
        color_muted: '#4A5568',
        color_background: '#FFFFFF',
        // Police custom : second déterminant du thème (hors Inter par défaut).
        font_heading: 'Lora',
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
  // La page ouvre le dialogue d'impression après chargement (jsdom : absent).
  window.print = jest.fn();
});

beforeEach(() => {
  getCVMock.mockReset();
});

describe('M3-T14 — aperçu = PDF : thème + langue de l\'enveloppe (4 templates)', () => {
  it.each([...TEMPLATE_IDS])(
    'template %s : applique le thème custom (variable CSS) ET la langue EN',
    async (templateId) => {
      getCVMock.mockResolvedValue(cvDetail(templateId, 'en'));
      const { container } = render(<CVPrintPage />);
      await screen.findByText(/Camille/);
      // Thème de l'enveloppe injecté en variable CSS scopée (même helper que
      // l'export : themeToCssVars via CvSheet).
      const html = container.innerHTML.toLowerCase();
      expect(html).toContain(`--cv-accent: ${CUSTOM_ACCENT.toLowerCase()}`);
      // Police custom de l'enveloppe injectée (même helper themeToCssVars). Les
      // guillemets de la pile sont échappés en &quot; dans l'innerHTML sérialisé.
      expect(html).toMatch(/--cv-font-heading:\s*&quot;lora/);
      // Langue de l'enveloppe appliquée : libellé anglais du registre.
      expect(screen.getByText('Professional Experience')).toBeInTheDocument();
    },
  );

  it('langue FR de l\'enveloppe : libellés français (même registre)', async () => {
    getCVMock.mockResolvedValue(cvDetail('modern_sobre', 'fr'));
    render(<CVPrintPage />);
    expect(
      await screen.findByText('Expérience professionnelle'),
    ).toBeInTheDocument();
  });
});
