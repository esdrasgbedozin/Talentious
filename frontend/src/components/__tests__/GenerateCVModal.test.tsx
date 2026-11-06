/**
 * M3-T13 — la modale de génération transmet les choix optionnels (modèle, langue,
 * thème) quand ils sont faits, et laisse la requête V1 INCHANGÉE (cv_name +
 * offer_text seuls) quand l'utilisateur n'y touche pas.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GenerateCVModal from '../GenerateCVModal';
import type { CVTemplate } from '@/lib/api';

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  }),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    startGeneration: jest.fn(),
    getCVTemplates: jest.fn(),
    getJobStatus: jest.fn(),
  };
});

import { startGeneration, getCVTemplates } from '@/lib/api';
const startGenerationMock = startGeneration as jest.Mock;
const getCVTemplatesMock = getCVTemplates as jest.Mock;

const CATALOG: CVTemplate[] = [
  {
    id: 'modern_sobre',
    name: 'Moderne sobre',
    is_free: true,
    default_theme_id: 'anthracite',
  } as CVTemplate,
  {
    id: 'tech',
    name: 'Tech',
    is_free: false,
    default_theme_id: 'anthracite',
  } as CVTemplate,
];

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GenerateCVModal isOpen onClose={jest.fn()} />
    </QueryClientProvider>,
  );
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Nom du CV/), {
    target: { value: 'Mon CV' },
  });
  fireEvent.change(screen.getByLabelText(/Texte de l'offre/), {
    target: { value: 'x'.repeat(60) },
  });
}

beforeEach(() => {
  startGenerationMock
    .mockReset()
    .mockResolvedValue({ job_id: 'job-1', status: 'queued' });
  getCVTemplatesMock.mockReset().mockResolvedValue(CATALOG);
  sessionStorage.clear();
});

describe('GenerateCVModal — enveloppe optionnelle (M3-T13)', () => {
  it('requête V1 inchangée : par défaut, envoie seulement cv_name et offer_text', async () => {
    renderModal();
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Générer mon CV/i }));

    await waitFor(() => expect(startGenerationMock).toHaveBeenCalled());
    const payload = startGenerationMock.mock.calls[0][0];
    expect(payload).toEqual({ cv_name: 'Mon CV', offer_text: 'x'.repeat(60) });
    expect(payload).not.toHaveProperty('template_id');
    expect(payload).not.toHaveProperty('target_language');
    expect(payload).not.toHaveProperty('theme');
  });

  it('transmet le modèle et la langue choisis', async () => {
    renderModal();
    await screen.findByRole('option', { name: /Tech/ });
    fillRequired();
    fireEvent.change(screen.getByLabelText('Modèle'), {
      target: { value: 'tech' },
    });
    fireEvent.change(screen.getByLabelText('Langue'), {
      target: { value: 'en' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Générer mon CV/i }));

    await waitFor(() => expect(startGenerationMock).toHaveBeenCalled());
    const payload = startGenerationMock.mock.calls[0][0];
    expect(payload.template_id).toBe('tech');
    expect(payload.target_language).toBe('en');
    expect(payload).not.toHaveProperty('theme');
  });

  it("choisir le français (défaut) ne transmet pas target_language", async () => {
    renderModal();
    fillRequired();
    fireEvent.change(screen.getByLabelText('Langue'), {
      target: { value: 'fr' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Générer mon CV/i }));

    await waitFor(() => expect(startGenerationMock).toHaveBeenCalled());
    const payload = startGenerationMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty('target_language');
  });

  it('transmet un thème personnalisé quand les couleurs sont modifiées', async () => {
    renderModal();
    fillRequired();
    fireEvent.click(screen.getByLabelText(/Personnaliser les couleurs/));
    // L'éditeur de thème apparaît : on change l'accent.
    fireEvent.change(await screen.findByLabelText("Couleur d'accent"), {
      target: { value: '#123ABC' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Générer mon CV/i }));

    await waitFor(() => expect(startGenerationMock).toHaveBeenCalled());
    const payload = startGenerationMock.mock.calls[0][0];
    expect(payload.theme.id).toBeNull();
    expect(payload.theme.name).toBe('Personnalisé');
    expect(payload.theme.tokens.color_accent).toBe('#123ABC');
    // is_free (readOnly) n'est jamais envoyé.
    expect(payload.theme).not.toHaveProperty('is_free');
  });

  it("cocher sans rien changer n'envoie pas de thème", async () => {
    renderModal();
    fillRequired();
    fireEvent.click(screen.getByLabelText(/Personnaliser les couleurs/));
    // Couleurs inchangées = thème par défaut : rien n'est envoyé.
    fireEvent.click(screen.getByRole('button', { name: /Générer mon CV/i }));

    await waitFor(() => expect(startGenerationMock).toHaveBeenCalled());
    expect(startGenerationMock.mock.calls[0][0]).not.toHaveProperty('theme');
  });

  it('valeurs initiales : modèle « Par défaut » et langue « Français »', async () => {
    renderModal();
    // Attendre le chargement du catalogue (évite un warning act sur setTemplates).
    await screen.findByRole('option', { name: /Tech/ });
    expect(screen.getByLabelText('Modèle')).toHaveValue('');
    expect(screen.getByLabelText('Langue')).toHaveValue('fr');
  });
});
