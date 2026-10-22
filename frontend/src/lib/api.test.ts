/**
 * M0-T08a/T08c — `updateCV` parle GeneratedCVData de bout en bout : l'éditeur
 * canonique envoie son état TEL QUEL au PUT /cv. Depuis PAH-M0 (2026-10-22),
 * la LECTURE est aussi un passthrough strict : la base prod est intégralement
 * canonique (backfill v2 + ceinture de coercition au worker), le pont legacy
 * `toCanonicalCVData` a été supprimé.
 */
import { apiClient, getCV, updateCV } from '@/lib/api';
import { createEmptyCVData, createEmptyCVExperience } from '@/lib/cvEditor';

describe('updateCV — envoie du GeneratedCVData au réseau (M0-T08a → T08c)', () => {
  it('envoie le canonique de l\'éditeur TEL QUEL (zéro transformation, ADR-CONTENT-SCHEMA)', async () => {
    const cv = createEmptyCVData();
    const exp = createEmptyCVExperience();
    exp.title = 'Dev';
    exp.company = 'Acme';
    exp.start_date = '2021-01';
    exp.end_date = null;
    exp.description = 'Desc';
    exp.highlighted_skills = ['Python', 'SQL'];
    cv.summary = 'Résumé';
    cv.selected_experiences = [exp];
    cv.highlighted_skills = [
      { name: 'Python', level: 'Expert', category: 'hard_skill', importance: 'Critical' },
    ];

    const putSpy = jest
      .spyOn(apiClient, 'put')
      .mockResolvedValue({ data: { cv_data_json: {} } });

    await updateCV('cv-123', { cv_name: 'Mon CV', cv_data_json: cv });

    expect(putSpy).toHaveBeenCalledTimes(1);
    const [url, body] = putSpy.mock.calls[0];
    expect(url).toBe('/cv/cv-123');
    const sent = body as { cv_name: string; cv_data_json: unknown };
    expect(sent.cv_name).toBe('Mon CV');
    // Passthrough strict : la MÊME référence, aucun champ réécrit — les
    // highlighted_skills par expérience survivent (critère M0-T08c).
    expect(sent.cv_data_json).toBe(cv);

    putSpy.mockRestore();
  });

  it('name-only : n\'envoie PAS cv_data_json (sinon un simple renommage viderait le CV)', async () => {
    const putSpy = jest
      .spyOn(apiClient, 'put')
      .mockResolvedValue({ data: { cv_data_json: {} } });

    await updateCV('cv-123', { cv_name: 'Nouveau nom' });

    const [, body] = putSpy.mock.calls[0];
    expect('cv_data_json' in (body as object)).toBe(false);
    expect((body as Record<string, unknown>).cv_name).toBe('Nouveau nom');

    putSpy.mockRestore();
  });

  it('renvoie la réponse du PUT en canonique (passthrough, symétrie avec getCV)', async () => {
    const putSpy = jest.spyOn(apiClient, 'put').mockResolvedValue({
      data: {
        cv_name: 'CV',
        cv_data_json: {
          personal_info: { first_name: 'A', last_name: 'B', email: 'a@b.fr' },
          summary: 'S',
          selected_experiences: [
            {
              id: 'exp-1',
              title: 'Dev',
              company: 'Acme',
              start_date: '2021-01',
              end_date: null,
              description: 'D',
              highlighted_skills: [],
            },
          ],
          highlighted_skills: [],
          selected_educations: [],
        },
      },
    });

    const result = await updateCV('cv-123', { cv_name: 'CV' });
    // La forme canonique du serveur passe TELLE QUELLE (le renderer et
    // l'éditeur la consomment directement — M0-T08b/T08c).
    expect(result.cv_data_json.selected_experiences).toHaveLength(1);
    expect(result.cv_data_json.selected_experiences[0].title).toBe('Dev');
    expect(result.cv_data_json.selected_experiences[0].end_date).toBeNull();

    putSpy.mockRestore();
  });
});

describe('updateCV — retour passthrough strict (PAH-M0, pont legacy supprimé)', () => {
  it('renvoie cv_data_json de la réponse PAR RÉFÉRENCE (zéro re-pontage)', async () => {
    const serverCv = { personal_info: { first_name: 'A' }, summary: 'S' };
    const putSpy = jest
      .spyOn(apiClient, 'put')
      .mockResolvedValue({ data: { cv_name: 'CV', cv_data_json: serverCv } });

    const result = await updateCV('cv-123', { cv_name: 'CV' });
    expect(result.cv_data_json).toBe(serverCv);

    putSpy.mockRestore();
  });
});

describe('getCV — lecture passthrough strict (PAH-M0, pont legacy supprimé)', () => {
  it('renvoie cv_data_json TEL QUEL, même pour une forme legacy résiduelle', async () => {
    // La garantie de canonicité vit désormais EN BASE (backfill v2 + ceinture
    // du worker), plus dans l'app : une forme legacy qui réapparaîtrait ne doit
    // PAS être re-pontée en silence — elle doit se voir (et se traiter en base,
    // le backfill committé est idempotent). Passthrough par RÉFÉRENCE.
    const legacy = {
      personal_info: { first_name: 'J', last_name: 'M', email: 'j@m.fr' },
      summary: 'V1 brut',
      experiences: [{ title: 'Dev', company: 'Acme', start_date: '2020-01' }],
    };
    const getSpy = jest
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ data: { cv_name: 'CV', cv_data_json: legacy } });

    const result = await getCV('cv-123');
    expect(result.cv_data_json).toBe(legacy);

    getSpy.mockRestore();
  });
});
