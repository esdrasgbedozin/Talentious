import { getExportErrorMessage } from '@/lib/exportErrors';

/** Fabrique une erreur de la forme reconnue par `axios.isAxiosError`. */
const axiosError = (status: number | undefined, data: unknown) => ({
  isAxiosError: true,
  response: status === undefined ? undefined : { status, data },
  message: `Request failed with status code ${status}`,
});

describe('getExportErrorMessage', () => {
  it('traduit un 409 job-in-progress en message tutoyé dédié', () => {
    const msg = getExportErrorMessage(
      axiosError(409, {
        type: 'https://talentious.fr/errors/job-in-progress',
        detail: 'An export job is already running.',
      }),
    );
    expect(msg).toBe(
      "Un export de ce CV est déjà en cours. Patiente un instant avant d'en relancer un.",
    );
  });

  it("traduit un 404 not-found vers un message qui invite à relancer l'export", () => {
    const msg = getExportErrorMessage(
      axiosError(404, { type: 'https://talentious.fr/errors/not-found' }),
    );
    expect(msg).toContain('introuvable');
    expect(msg).toContain("Relance l'export");
  });

  it('traduit les variantes premium (402)', () => {
    const msg = getExportErrorMessage(
      axiosError(402, {
        type: 'https://talentious.fr/errors/premium-template-required',
      }),
    );
    expect(msg).toContain('pass actif');
  });

  it("mappe aussi un type fourni sans le préfixe d'URL", () => {
    const msg = getExportErrorMessage(
      axiosError(409, { type: 'job-in-progress' }),
    );
    expect(msg).toContain('déjà en cours');
  });

  it('ne fuite PAS le detail serveur pour un type inconnu : repli FR générique', () => {
    const msg = getExportErrorMessage(
      axiosError(400, {
        type: 'https://talentious.fr/errors/some-other-error',
        detail: 'Some raw english backend detail.',
      }),
    );
    expect(msg).not.toContain('english');
    expect(msg).toBe("L'export a échoué. Réessaie dans un instant.");
  });

  it('repli FR dédié pour un 429 (trop de demandes)', () => {
    expect(getExportErrorMessage(axiosError(429, {}))).toContain(
      'Trop de demandes',
    );
  });

  it('repli FR dédié pour une erreur serveur 5xx', () => {
    expect(getExportErrorMessage(axiosError(503, {}))).toContain(
      'momentanément indisponible',
    );
  });

  it("repli FR dédié quand il n'y a pas de réponse (réseau)", () => {
    expect(getExportErrorMessage(axiosError(undefined, undefined))).toContain(
      'Connexion au service impossible',
    );
  });

  it('délègue les 422 (invalid_params) au helper générique FR', () => {
    const msg = getExportErrorMessage(
      axiosError(422, {
        type: 'https://talentious.fr/errors/validation-error',
        detail: 'Validation failed',
        invalid_params: [
          { loc: ['body', 'format'], type: 'enum', msg: 'invalid' },
        ],
      }),
    );
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it("renvoie le message d'une Error métier (flux d'export)", () => {
    expect(getExportErrorMessage(new Error("L'export a échoué."))).toBe(
      "L'export a échoué.",
    );
  });

  it('fournit un repli pour une valeur totalement inconnue', () => {
    expect(getExportErrorMessage('boom')).toContain('échoué');
  });
});
