/**
 * M3-T11 — sauvegarde du thème dans l'éditeur : PUT d'ENVELOPPE seul ({ theme }),
 * jamais le contenu (critère du ticket ; M1-T14 : contenu et enveloppe
 * indépendants). Couvre aussi l'état « modifié » dérivé, l'aperçu live, le
 * round-trip custom (id null / « Personnalisé »), et la garde de sortie.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
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

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

// cv-render réel (contrast, polices, thème) + stub de template qui expose le
// thème reçu, pour vérifier l'aperçu en direct.
jest.mock('@talentious/cv-render', () => {
  const actual = jest.requireActual('@talentious/cv-render');
  return {
    ...actual,
    getTemplate: () =>
      function TemplateStub(props: { theme?: { color_accent?: string } }) {
        return (
          <div
            data-testid="preview"
            data-accent={props.theme?.color_accent ?? ''}
          />
        );
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

function cvDetail(): CVDetail {
  return {
    id: 'cv-1',
    cv_name: 'CV Camille',
    template_id: 'modern_sobre',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    job_offer_context: null,
    cv_data_json: completeFixture as unknown as GeneratedCVData,
    theme: THEME,
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

const SAVE = /Enregistrer le thème/i;

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});

beforeEach(() => {
  push.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  getCVMock.mockReset().mockResolvedValue(cvDetail());
  // Le serveur renvoie ce qu'il a stocké : on écho le thème envoyé.
  updateCVMock.mockReset().mockImplementation((_id, payload) =>
    Promise.resolve({
      ...cvDetail(),
      theme: payload.theme ? { ...payload.theme, is_free: false } : THEME,
    }),
  );
  getCVTemplatesMock.mockReset().mockResolvedValue(CATALOG);
});

describe("M3-T11 — sauvegarde du thème dans l'éditeur", () => {
  it("envoie l'enveloppe { theme } seule, jamais le contenu", async () => {
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");

    fireEvent.change(accent, { target: { value: '#123ABC' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));

    await waitFor(() => expect(updateCVMock).toHaveBeenCalledTimes(1));
    const [id, body] = updateCVMock.mock.calls[0];
    expect(id).toBe('cv-1');
    expect(body).toHaveProperty('theme');
    expect(body).not.toHaveProperty('cv_data_json');
    expect(body).not.toHaveProperty('cv_name');
    expect(body.theme).toEqual({
      id: 'anthracite',
      name: 'Anthracite',
      tokens: { ...THEME.tokens, color_accent: '#123ABC' },
    });
  });

  it("modifier le contenu n'empêche pas un save thème d'enveloppe seule", async () => {
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");

    // Contenu modifié (prénom) => isDirty du CONTENU.
    fireEvent.change(screen.getByLabelText('Prénom'), {
      target: { value: 'Alex' },
    });
    expect(
      screen.getByText('Modifications non enregistrées'),
    ).toBeInTheDocument();

    // Thème modifié, puis save thème.
    fireEvent.change(accent, { target: { value: '#123ABC' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));

    await waitFor(() => expect(updateCVMock).toHaveBeenCalledTimes(1));
    const body = updateCVMock.mock.calls[0][1];
    expect(body).toHaveProperty('theme');
    expect(body).not.toHaveProperty('cv_data_json');
    expect(body).not.toHaveProperty('cv_name');
    // Le contenu reste « non enregistré » : le save thème ne l'a pas touché.
    expect(
      screen.getByText('Modifications non enregistrées'),
    ).toBeInTheDocument();
  });

  it("marque « Thème modifié » à l'édition et nettoie après enregistrement", async () => {
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");
    const saveBtn = screen.getByRole('button', { name: SAVE });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(accent, { target: { value: '#123ABC' } });
    expect(screen.getByText('Thème modifié')).toBeInTheDocument();
    expect(saveBtn).toBeEnabled();

    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Thème enregistré.'),
    );
    expect(screen.queryByText('Thème modifié')).not.toBeInTheDocument();
  });

  it("revenir à la valeur sauvée efface l'état « modifié » (dérivé)", async () => {
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");

    fireEvent.change(accent, { target: { value: '#123ABC' } });
    expect(screen.getByText('Thème modifié')).toBeInTheDocument();

    // Retour à la couleur d'origine : plus de « modifié », pas de faux positif.
    fireEvent.change(accent, { target: { value: '#2D3748' } });
    expect(screen.queryByText('Thème modifié')).not.toBeInTheDocument();
  });

  it('round-trip custom : resync id null / « Personnalisé », renvoyés au 2e PUT', async () => {
    // Le serveur reconnaît des tokens modifiés comme personnalisés.
    updateCVMock.mockReset().mockImplementation((_id, payload) =>
      Promise.resolve({
        ...cvDetail(),
        theme: { id: null, name: 'Personnalisé', tokens: payload.theme.tokens },
      }),
    );
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");

    fireEvent.change(accent, { target: { value: '#123ABC' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE }));
    await waitFor(() => expect(updateCVMock).toHaveBeenCalledTimes(1));

    // Ré-édition puis re-save : la provenance resynchronisée part au 2e PUT.
    fireEvent.change(accent, { target: { value: '#445566' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: SAVE })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: SAVE }));
    await waitFor(() => expect(updateCVMock).toHaveBeenCalledTimes(2));

    const secondBody = updateCVMock.mock.calls[1][1];
    expect(secondBody.theme.id).toBeNull();
    expect(secondBody.theme.name).toBe('Personnalisé');
    expect(secondBody.theme.tokens.color_accent).toBe('#445566');
  });

  it("répercute le thème dans l'aperçu en direct", async () => {
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");

    fireEvent.change(accent, { target: { value: '#123ABC' } });

    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('preview')
          .some((el) => el.getAttribute('data-accent') === '#123ABC'),
      ).toBe(true),
    );
  });

  it('prévient avant de quitter avec un thème modifié (beforeunload + confirm)', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");

    // Rien de modifié : pas de blocage.
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);

    fireEvent.change(accent, { target: { value: '#123ABC' } });

    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);

    // Retour avec thème modifié => confirmation demandée.
    fireEvent.click(screen.getByRole('button', { name: /Mes CVs/i }));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('échec 422 : message, état modifié conservé, bouton réactivé', async () => {
    updateCVMock.mockReset().mockRejectedValue(
      new axios.AxiosError('Unprocessable', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422,
        data: {
          type: 'https://talentious.fr/errors/validation-error',
          invalid_params: [],
        },
      } as never),
    );
    render(<CVEditorPage />);
    const accent = await screen.findByLabelText("Couleur d'accent");
    fireEvent.change(accent, { target: { value: '#123ABC' } });
    const btn = screen.getByRole('button', { name: SAVE });
    fireEvent.click(btn);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // L'échec ne nettoie pas l'état et réactive le bouton (réessai possible).
    expect(screen.getByText('Thème modifié')).toBeInTheDocument();
    expect(btn).toBeEnabled();
  });
});
