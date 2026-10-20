/**
 * M0-T08a — `updateCV` doit envoyer du GeneratedCVData canonique au PUT /cv
 * (et non le ProfileData de l'éditeur, qui serait vidé par la coercition backend).
 */
import { apiClient, updateCV } from '@/lib/api';
import { createEmptyProfile, type UserProfile } from '@/types/profile';

describe('updateCV — envoie du GeneratedCVData au réseau (M0-T08a)', () => {
  it('convertit le ProfileData de l\'éditeur en clés canoniques selected_*', async () => {
    const profile: UserProfile = {
      ...createEmptyProfile(),
      summary: 'Résumé',
      experiences: [
        {
          id: 'exp-1',
          title: 'Dev',
          company: 'Acme',
          location: '',
          start_date: '2021-01',
          end_date: '',
          is_current: true,
          description: 'Desc',
          achievements: ['A1'],
        },
      ],
      skills: { hard: ['Python'], soft: [] },
    };

    const putSpy = jest
      .spyOn(apiClient, 'put')
      .mockResolvedValue({ data: { cv_data_json: {} } });

    await updateCV('cv-123', { cv_name: 'Mon CV', cv_data_json: profile });

    expect(putSpy).toHaveBeenCalledTimes(1);
    const [url, body] = putSpy.mock.calls[0];
    expect(url).toBe('/cv/cv-123');
    const sent = body as Record<string, unknown>;
    expect(sent.cv_name).toBe('Mon CV');
    // Clés canoniques présentes, clés ProfileData absentes.
    expect('selected_experiences' in (sent.cv_data_json as object)).toBe(true);
    expect('experiences' in (sent.cv_data_json as object)).toBe(false);
    const cv = sent.cv_data_json as Record<string, unknown>;
    expect((cv.selected_experiences as unknown[]).length).toBe(1);
    expect((cv.highlighted_skills as unknown[]).length).toBe(1);

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
    // La forme canonique du serveur passe TELLE QUELLE (le renderer la consomme
    // directement ; l'éditeur normalise à son bord — M0-T08b).
    expect(result.cv_data_json.selected_experiences).toHaveLength(1);
    expect(result.cv_data_json.selected_experiences[0].title).toBe('Dev');
    expect(result.cv_data_json.selected_experiences[0].end_date).toBeNull();

    putSpy.mockRestore();
  });
});
