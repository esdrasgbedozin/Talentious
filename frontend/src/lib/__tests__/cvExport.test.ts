import { apiClient } from '@/lib/api';
import {
  exportCvPdf,
  parseContentDispositionFilename,
  toSafePdfFilename,
} from '@/lib/cvExport';
import { getExportErrorMessage } from '@/lib/exportErrors';

describe('toSafePdfFilename', () => {
  it('dérive un nom .pdf du nom du CV', () => {
    expect(toSafePdfFilename('CV - Dev React - Google')).toBe(
      'CV - Dev React - Google.pdf',
    );
  });

  it('ne double pas l’extension si déjà .pdf', () => {
    expect(toSafePdfFilename('mon cv.pdf')).toBe('mon cv.pdf');
  });

  it('retire séparateurs de chemin, caractères de contrôle et réservés', () => {
    expect(toSafePdfFilename('a/b\\c:d*e?"f"')).toBe('a b c d e f.pdf');
  });

  it('repli cv.pdf si vide après nettoyage', () => {
    expect(toSafePdfFilename('   ')).toBe('cv.pdf');
    expect(toSafePdfFilename('')).toBe('cv.pdf');
  });

  it('borne la longueur', () => {
    const out = toSafePdfFilename('x'.repeat(300));
    expect(out.endsWith('.pdf')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(124);
  });
});

const JOB_ID = 'job-1';
const DOWNLOAD_PATH = `/jobs/${JOB_ID}/download`;

const acceptedJob = {
  data: { job_id: JOB_ID, job_type: 'export', status: 'queued', format: 'pdf' },
};

const jobState = (status: string, downloadUrl?: string) => ({
  data: {
    job_id: JOB_ID,
    job_type: 'export',
    status,
    created_at: '2026-10-30T10:00:00Z',
    ...(downloadUrl
      ? {
          result: {
            result_kind: 'export',
            result_id: 'cv-1',
            download_url: downloadUrl,
          },
        }
      : {}),
  },
});

describe('parseContentDispositionFilename', () => {
  it('lit filename="..."', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="mon-cv.pdf"'),
    ).toBe('mon-cv.pdf');
  });

  it('préfère filename* (RFC 5987) et le décode', () => {
    expect(
      parseContentDispositionFilename(
        'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'CV%20Final.pdf',
      ),
    ).toBe('CV Final.pdf');
  });

  it('réduit au basename et retire les caractères de contrôle (durcissement)', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd.pdf",
      ),
    ).toBe('passwd.pdf');
  });

  it("retombe sur un nom par défaut si l'en-tête est absent", () => {
    expect(parseContentDispositionFilename(undefined)).toBe('cv.pdf');
  });
});

describe('exportCvPdf — flux asynchrone', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('succès : POST → en cours → terminé → renvoie le fichier', async () => {
    const postSpy = jest
      .spyOn(apiClient, 'post')
      .mockResolvedValue(acceptedJob as never);

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    let statusCalls = 0;
    const getSpy = jest
      .spyOn(apiClient, 'get')
      .mockImplementation((url: string) => {
        if (url === `/jobs/${JOB_ID}`) {
          statusCalls += 1;
          return Promise.resolve(
            statusCalls === 1
              ? jobState('running') // 1er sondage : en cours
              : jobState('succeeded', DOWNLOAD_PATH), // 2e : terminé
          ) as never;
        }
        if (url === DOWNLOAD_PATH) {
          return Promise.resolve({
            data: blob,
            headers: {
              'content-disposition': 'attachment; filename="mon-cv.pdf"',
            },
          }) as never;
        }
        throw new Error(`URL inattendue : ${url}`);
      });

    const promise = exportCvPdf('cv-1');
    await jest.advanceTimersByTimeAsync(3_000); // → running
    await jest.advanceTimersByTimeAsync(3_000); // → succeeded + download
    const file = await promise;

    expect(postSpy).toHaveBeenCalledWith(
      '/cv/cv-1/export',
      { format: 'pdf' },
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(file.filename).toBe('mon-cv.pdf');
    expect(file.blob).toBe(blob);
    expect(statusCalls).toBe(2); // a bien transité par « en cours »
    expect(getSpy).toHaveBeenCalledWith(
      DOWNLOAD_PATH,
      expect.objectContaining({ responseType: 'blob' }),
    );
  });

  it('échec : un job failed lève un message tutoyé, sans tenter le téléchargement', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue(acceptedJob as never);
    const getSpy = jest
      .spyOn(apiClient, 'get')
      .mockResolvedValue(jobState('failed') as never);

    const promise = exportCvPdf('cv-1');
    const expectation = expect(promise).rejects.toThrow(/l'export a échoué/i);
    await jest.advanceTimersByTimeAsync(3_000);
    await expectation;

    expect(getSpy).not.toHaveBeenCalledWith(DOWNLOAD_PATH, expect.anything());
  });

  it('borne de temps : un job qui ne finit jamais est abandonné après le délai', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue(acceptedJob as never);
    jest
      .spyOn(apiClient, 'get')
      .mockResolvedValue(jobState('running') as never);

    const promise = exportCvPdf('cv-1');
    const expectation = expect(promise).rejects.toThrow(/trop de temps/i);
    await jest.advanceTimersByTimeAsync(125_000); // > borne globale (120 s)
    await expectation;
  });

  it('propage une erreur réseau survenue pendant le polling (arrête la boucle)', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue(acceptedJob as never);
    jest
      .spyOn(apiClient, 'get')
      .mockRejectedValue(
        Object.assign(new Error('Network Error'), { isAxiosError: true }),
      );

    const promise = exportCvPdf('cv-1');
    const expectation = expect(promise).rejects.toBeDefined();
    await jest.advanceTimersByTimeAsync(3_000);
    await expectation;
  });

  it('terminé sans fichier : lève un message invitant à relancer', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue(acceptedJob as never);
    jest
      .spyOn(apiClient, 'get')
      .mockResolvedValue(jobState('succeeded') as never);

    const promise = exportCvPdf('cv-1');
    const expectation = expect(promise).rejects.toThrow(/indisponible/i);
    await jest.advanceTimersByTimeAsync(3_000);
    await expectation;
  });

  it.each([
    ['absolue', 'https://evil.example/jobs/x/download'],
    ['protocole-relative', '//evil.example/jobs/x/download'],
    ['hors motif', '/jobs/job-1/other'],
  ])(
    'sécurité : refuse un download_url %s (pas de requête tierce avec le Bearer)',
    async (_label, maliciousUrl) => {
      jest.spyOn(apiClient, 'post').mockResolvedValue(acceptedJob as never);
      const getSpy = jest
        .spyOn(apiClient, 'get')
        .mockResolvedValue(jobState('succeeded', maliciousUrl) as never);

      const promise = exportCvPdf('cv-1');
      const expectation = expect(promise).rejects.toThrow(/indisponible/i);
      await jest.advanceTimersByTimeAsync(3_000);
      await expectation;

      expect(getSpy).not.toHaveBeenCalledWith(maliciousUrl, expect.anything());
    },
  );

  it('traduit une erreur de téléchargement dont le corps est un Blob problem+json (404 purgé)', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue(acceptedJob as never);
    const problemJson = JSON.stringify({
      type: 'https://talentious.fr/errors/not-found',
    });
    const problemBlob = new Blob([problemJson], {
      type: 'application/problem+json',
    });
    // jsdom n'implémente pas toujours Blob.text() : on le garantit pour le test
    // (les navigateurs cibles l'implémentent tous).
    Object.defineProperty(problemBlob, 'text', {
      value: () => Promise.resolve(problemJson),
    });
    jest.spyOn(apiClient, 'get').mockImplementation((url: string) => {
      if (url === `/jobs/${JOB_ID}`) {
        return Promise.resolve(jobState('succeeded', DOWNLOAD_PATH)) as never;
      }
      // Le GET binaire échoue : axios livre le corps d'erreur en Blob.
      return Promise.reject({
        isAxiosError: true,
        response: { status: 404, data: problemBlob },
      }) as never;
    });

    const promise = exportCvPdf('cv-1');
    let caught: unknown;
    const expectation = promise.catch((e) => {
      caught = e;
    });
    await jest.advanceTimersByTimeAsync(3_000);
    await expectation;

    // Le corps Blob a été reparsé → le mapper retrouve le type RFC 7807.
    expect(getExportErrorMessage(caught)).toContain('introuvable');
  });

  it("propage l'erreur axios du démarrage (409) sans la transformer", async () => {
    jest.spyOn(apiClient, 'post').mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { type: 'https://talentious.fr/errors/job-in-progress' },
      },
    } as never);

    await expect(exportCvPdf('cv-1')).rejects.toMatchObject({
      response: { status: 409 },
    });
  });
});
