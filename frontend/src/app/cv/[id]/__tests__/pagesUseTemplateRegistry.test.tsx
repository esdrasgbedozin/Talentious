/**
 * M0-T12 — L'éditeur et la page print consomment `template_id` via le registre.
 *
 * Critère du ticket : la page rend le composant désigné par `template_id`.
 * Les pages ne mappent JAMAIS un id elles-mêmes (ADR-TEMPLATE-REGISTRY) : elles
 * délèguent à `getTemplate(detail.template_id)` — le registre (testé côté
 * package) garantit alias legacy `modern_v1` et repli `modern_sobre`.
 *
 * Preuve en deux temps : (1) un composant TÉMOIN substitué à la résolution doit
 * apparaître dans le DOM — une page qui appellerait getTemplate puis rendrait
 * CVRenderer en dur échouerait ; (2) avec l'implémentation RÉELLE et un
 * template_id corrompu à l'exécution, la page rend quand même (repli registre).
 */
import { render, screen, waitFor } from '@testing-library/react';
import type { GeneratedCVData } from '@talentious/cv-render';
import type { CVDetail } from '@/lib/api';
import completeFixture from '../../../../../../fixtures/cv-reference/complete.json';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cv-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// Navbar (AuthContext) et toasts : hors sujet ici, neutralisés.
jest.mock('@/components/Navbar', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('@talentious/cv-render', () => {
  const actual = jest.requireActual('@talentious/cv-render');
  return { ...actual, getTemplate: jest.fn(actual.getTemplate) };
});

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getCV: jest.fn(),
  updateCV: jest.fn(),
}));

import { getTemplate } from '@talentious/cv-render';
import { getCV } from '@/lib/api';
import CVPrintPage from '../print/page';
import CVEditorPage from '../edit/page';

const getTemplateMock = getTemplate as jest.MockedFunction<typeof getTemplate>;
const getCVMock = getCV as jest.MockedFunction<typeof getCV>;

/** Témoin : si la page rend bien LE composant résolu (et pas un import en dur),
 * ce marqueur apparaît dans le DOM. */
const TemplateSpy = () => <div data-testid="resolved-template" />;

/** Détail de CV tel que renvoyé par GET /cv/{id} — enveloppe + contenu canonique. */
function cvDetail(templateId: string): CVDetail {
  return {
    id: 'cv-1',
    cv_name: 'CV Camille',
    template_id: templateId,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    job_offer_context: null,
    cv_data_json: completeFixture as unknown as GeneratedCVData,
    gcs_pdf_url: null,
  };
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // La page print ouvre le dialogue d'impression après chargement (jsdom : absent).
  window.print = jest.fn();
});

beforeEach(() => {
  // mockClear ne retire PAS un mockReturnValue posé par un test précédent :
  // on restaure l'implémentation réelle du registre avant chaque test.
  getTemplateMock.mockReset();
  getTemplateMock.mockImplementation(
    jest.requireActual('@talentious/cv-render').getTemplate,
  );
  getCVMock.mockReset();
});

describe('M0-T12 — page print', () => {
  it('rend LE composant résolu par le registre pour le template_id du document (V1 modern_v1)', async () => {
    getTemplateMock.mockReturnValue(TemplateSpy);
    getCVMock.mockResolvedValue(cvDetail('modern_v1'));
    render(<CVPrintPage />);
    // Le composant RÉSOLU est celui qui apparaît (pas un CVRenderer importé en dur)…
    expect(await screen.findByTestId('resolved-template')).toBeInTheDocument();
    // …et la résolution est déléguée au registre, avec l'id de l'ENVELOPPE.
    expect(getTemplateMock).toHaveBeenCalledWith('modern_v1');
  });

  it("template_id corrompu à l'exécution (null malgré le contrat) : la page rend quand même (repli réel du registre)", async () => {
    getCVMock.mockResolvedValue(cvDetail(null as unknown as string));
    render(<CVPrintPage />);
    expect(await screen.findByText(/Camille/)).toBeInTheDocument();
  });

  it('cv_data_json corrompu (null malgré le contrat) : la page rend une feuille vide, pas une page blanche', async () => {
    // Depuis la suppression du pont (PAH-M0), getCV est un passthrough strict :
    // la défense au chargement vit dans la page (ensureCVShape, comme
    // l'éditeur). Sans elle, CVRenderer lit `cv.personal_info` sur null
    // → TypeError → page blanche à l'impression (revue du ticket).
    const detail = cvDetail('modern_sobre');
    detail.cv_data_json = null as unknown as GeneratedCVData;
    getCVMock.mockResolvedValue(detail);
    const { container } = render(<CVPrintPage />);
    // La feuille se rend (vide), et le chargement va au bout (document.title
    // est posé après setCv — il n'est jamais atteint si le rendu crashe).
    await waitFor(() => expect(document.title).toBe('CV Camille'));
    expect(container.querySelector('.cv-sheet')).toBeTruthy();
  });
});

describe('M0-T12 — éditeur (aperçu)', () => {
  it("rend l'aperçu via LE composant résolu par le registre avec le template_id chargé", async () => {
    getTemplateMock.mockReturnValue(TemplateSpy);
    getCVMock.mockResolvedValue(cvDetail('modern_sobre'));
    render(<CVEditorPage />);
    await waitFor(() => expect(getCVMock).toHaveBeenCalled());
    expect(await screen.findByDisplayValue('CV Camille')).toBeInTheDocument();
    expect(await screen.findByTestId('resolved-template')).toBeInTheDocument();
    expect(getTemplateMock).toHaveBeenCalledWith('modern_sobre');
  });
});
