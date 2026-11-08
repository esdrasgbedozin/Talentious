import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ATSScorePanel, {
  ATS_DISCLAIMER,
} from '@/components/cv/ATSScorePanel';
import { computeAtsScore, type ATSScoreResult } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, computeAtsScore: jest.fn() };
});

const computeAtsScoreMock = computeAtsScore as jest.Mock;

const LONG_OFFER =
  'Nous recherchons un ingénieur backend senior maîtrisant Python et FastAPI.';

function fillOffer(value: string = LONG_OFFER) {
  const textarea = screen.getByLabelText(/Texte de l.offre visée/i);
  fireEvent.change(textarea, { target: { value } });
  return textarea;
}

function clickAnalyser() {
  fireEvent.click(screen.getByRole('button', { name: /Analyser/i }));
}

function fullResult(over: Partial<ATSScoreResult> = {}): ATSScoreResult {
  return {
    cv_id: 'cv-1',
    job_offer_id: 'offer-1',
    score: 72,
    matched_keywords: [
      { name: 'Python', category: 'hard_skill', importance: 'Critical', aliases: [] },
    ],
    missing_keywords: [
      { name: 'Kubernetes', category: 'hard_skill', importance: 'Important', aliases: [] },
    ],
    missing_keywords_count: 1,
    detail_truncated: false,
    ...over,
  };
}

beforeEach(() => {
  computeAtsScoreMock.mockReset();
});

describe('ATSScorePanel', () => {
  // T12 — widget score : rendu complet + payload trimé
  it('affiche le score, la jauge et le détail, et envoie l’offre trimée', async () => {
    computeAtsScoreMock.mockResolvedValue(fullResult({ score: 72 }));
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer(`   ${LONG_OFFER}   `);
    clickAnalyser();

    expect(await screen.findByText('72')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
    expect(screen.getByText('Bon alignement')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(computeAtsScoreMock).toHaveBeenCalledWith('cv-1', {
      offerText: LONG_OFFER,
    });
  });

  // T12 — états : bouton désactivé tant que l'offre est trop courte
  it('désactive Analyser sous le minimum de caractères', () => {
    render(<ATSScorePanel cvId="cv-1" />);
    const button = screen.getByRole('button', { name: /Analyser/i });
    expect(button).toBeDisabled();
    fillOffer('trop court');
    expect(button).toBeDisabled();
    fillOffer(LONG_OFFER);
    expect(button).toBeEnabled();
  });

  // T12 — score 0 : bande « faible », chiffre 0
  it('affiche la bande « faible » pour un score de 0', async () => {
    computeAtsScoreMock.mockResolvedValue(
      fullResult({ score: 0, matched_keywords: [], missing_keywords: [] }),
    );
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    expect(await screen.findByText('0')).toBeInTheDocument();
    expect(screen.getByText('Alignement faible')).toBeInTheDocument();
  });

  // T14 — avertissement D10 : texte EXACT (verrou littéral indépendant de l'export)
  it('affiche l’avertissement D10 au texte exact', async () => {
    computeAtsScoreMock.mockResolvedValue(fullResult());
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    const exact =
      'Score indicatif : il compte les mots-clés de l’offre présents dans ton CV pour t’aider à l’ajuster. Il ne garantit pas le passage d’un filtre ATS réel.';
    expect(ATS_DISCLAIMER).toBe(exact);
    expect(await screen.findByText(exact)).toBeInTheDocument();
  });

  // T13 — palier gratuit : décompte + invite, SANS lister de mots-clés
  it('tronqué : montre le décompte et l’invite au Pass, sans détail', async () => {
    computeAtsScoreMock.mockResolvedValue(
      fullResult({
        score: 48,
        matched_keywords: [],
        missing_keywords: [],
        missing_keywords_count: 7,
        detail_truncated: true,
      }),
    );
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    expect(await screen.findByText('48')).toBeInTheDocument();
    expect(screen.getByText(/Il manque 7\s+mots-clés/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Voir les Pass/i }),
    ).toHaveAttribute('href', '/billing');
    expect(screen.queryByText(/Mots-clés présents/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mots-clés manquants \(/)).not.toBeInTheDocument();
  });

  // T13 — singulier « 1 mot-clé »
  it('tronqué : accorde « 1 mot-clé » au singulier', async () => {
    computeAtsScoreMock.mockResolvedValue(
      fullResult({
        matched_keywords: [],
        missing_keywords: [],
        missing_keywords_count: 1,
        detail_truncated: true,
      }),
    );
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    expect(await screen.findByText(/Il manque 1\s+mot-clé/)).toBeInTheDocument();
  });

  // T13 — liste partielle RÉELLE au palier gratuit (contrat D3) : on l'affiche
  it('tronqué : affiche les mots-clés partiels réels s’ils sont fournis', async () => {
    computeAtsScoreMock.mockResolvedValue(
      fullResult({
        matched_keywords: [],
        missing_keywords: [
          { name: 'Docker', category: 'hard_skill', importance: 'Important', aliases: [] },
        ],
        missing_keywords_count: 5,
        detail_truncated: true,
      }),
    );
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    expect(await screen.findByText('Docker')).toBeInTheDocument();
    expect(screen.getByText(/Il manque 5\s+mots-clés/)).toBeInTheDocument();
  });

  // T13 — tronqué sans manquant : message prudent, pas d'invite
  it('tronqué : message neutre quand rien ne manque', async () => {
    computeAtsScoreMock.mockResolvedValue(
      fullResult({
        score: 90,
        matched_keywords: [],
        missing_keywords: [],
        missing_keywords_count: 0,
        detail_truncated: true,
      }),
    );
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    expect(
      await screen.findByText(/Aucun mot-clé manquant détecté sur ce palier/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Voir les Pass/i })).not.toBeInTheDocument();
  });

  // T12 — offre sans mot-clé exploitable (détail complet vide)
  it('affiche un message neutre quand aucun mot-clé n’est détecté', async () => {
    computeAtsScoreMock.mockResolvedValue(
      fullResult({ matched_keywords: [], missing_keywords: [] }),
    );
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    expect(
      await screen.findByText(/Aucun mot-clé exploitable/),
    ).toBeInTheDocument();
  });

  // T15 — erreurs amont traduites
  it('traduit une panne de l’agent (502)', async () => {
    computeAtsScoreMock.mockRejectedValue({ response: { status: 502 } });
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/momentanément indisponible/i);
  });

  it('traduit la limite gratuite (429)', async () => {
    computeAtsScoreMock.mockRejectedValue({ response: { status: 429 } });
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/limite de scores gratuits/i);
  });

  // T15 — erreur générique : passe par getErrorMessage
  it('affiche un message générique pour une erreur sans statut', async () => {
    computeAtsScoreMock.mockRejectedValue(new Error('Boom réseau'));
    render(<ATSScorePanel cvId="cv-1" />);
    fillOffer();
    clickAnalyser();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Boom réseau/);
  });

  // T15 — offre liée au CV
  it('remplit le textarea avec l’offre liée au CV en un clic', async () => {
    render(
      <ATSScorePanel cvId="cv-1" linkedOfferText="Offre liée au CV de test à réutiliser pour le score." />,
    );
    const textarea = screen.getByLabelText(/Texte de l.offre visée/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    fireEvent.click(
      screen.getByRole('button', { name: /Utiliser l.offre liée à ce CV/i }),
    );
    await waitFor(() =>
      expect(textarea.value).toContain('Offre liée au CV de test'),
    );
  });

  it('n’affiche pas le bouton d’offre liée quand il n’y en a pas', () => {
    render(<ATSScorePanel cvId="cv-1" />);
    expect(
      screen.queryByRole('button', { name: /Utiliser l.offre liée/i }),
    ).not.toBeInTheDocument();
  });
});
