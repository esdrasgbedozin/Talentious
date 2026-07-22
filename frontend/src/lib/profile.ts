/**
 * Profile API Client - Talentious
 * Functions to interact with profile endpoints
 */

import { apiClient, getErrorMessage } from './api';
import { UserProfile, ProfileResponse, ProfileUpdateRequest } from '@/types/profile';

/**
 * Get user profile
 * @returns User profile data
 */
export const getProfile = async (): Promise<ProfileResponse> => {
  try {
    const response = await apiClient.get<ProfileResponse>('/profile');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * The canonical contract validates optional dates/URLs with strict patterns
 * (e.g. `^\d{4}-\d{2}$`). The form state initializes those fields as '' —
 * sending '' would 422 the WHOLE profile save (bug: a project with an empty
 * end date blocked every subsequent save). Sanitize at this single choke
 * point: empty optional fields become null, empty list entries are dropped.
 */
const emptyToNull = <T extends Record<string, unknown>>(obj: T, keys: string[]): T => {
  const copy: Record<string, unknown> = { ...obj };
  for (const k of keys) {
    if (copy[k] === '') copy[k] = null;
  }
  return copy as T;
};

export const sanitizeProfileForSave = (profile: UserProfile): UserProfile => ({
  ...profile,
  experiences: (profile.experiences ?? []).map((e) => ({
    ...emptyToNull(e as Record<string, unknown>, ['end_date']),
    achievements: (e.achievements ?? []).filter(Boolean),
  })) as UserProfile['experiences'],
  educations: (profile.educations ?? []).map((e) =>
    emptyToNull(e as Record<string, unknown>, ['start_date', 'end_date']),
  ) as UserProfile['educations'],
  projects: (profile.projects ?? []).map((p) => ({
    ...emptyToNull(p as Record<string, unknown>, ['start_date', 'end_date', 'url']),
    technologies: (p.technologies ?? []).filter(Boolean),
  })) as UserProfile['projects'],
  certifications: (profile.certifications ?? []).map((c) =>
    emptyToNull(c as Record<string, unknown>, [
      'issue_date',
      'expiration_date',
      'credential_url',
    ]),
  ) as UserProfile['certifications'],
  // Language requires name AND level — drop half-empty rows instead of 422ing.
  languages: (profile.languages ?? []).filter((l) => l.name && l.level),
});

/**
 * Inverse of the save-sanitizer: the canonical draft (from the PDF import)
 * uses null for optional fields, but the form state expects '' strings for
 * controlled inputs. Normalizes a draft into a form-ready UserProfile.
 */
export const draftToFormProfile = (draft: UserProfile): UserProfile => {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    ...draft,
    personal_info: Object.fromEntries(
      Object.entries(draft.personal_info ?? {}).map(([k, v]) => [k, s(v)]),
    ) as UserProfile['personal_info'],
    summary: s(draft.summary),
    experiences: (draft.experiences ?? []).map((e) => ({
      ...e,
      location: s(e.location),
      start_date: s(e.start_date),
      end_date: s(e.end_date),
      is_current: !!e.is_current,
      description: s(e.description),
      achievements: e.achievements ?? [],
    })),
    educations: (draft.educations ?? []).map((e) => ({
      ...e,
      location: s(e.location),
      field: s(e.field),
      start_date: s(e.start_date),
      end_date: s(e.end_date),
      description: s(e.description),
      grade: s(e.grade),
    })),
    skills: {
      hard: draft.skills?.hard ?? [],
      soft: draft.skills?.soft ?? [],
    },
    languages: draft.languages ?? [],
    projects: (draft.projects ?? []).map((p) => ({
      ...p,
      role: s(p.role),
      url: s(p.url),
      start_date: s(p.start_date),
      end_date: s(p.end_date),
      technologies: p.technologies ?? [],
    })),
    certifications: (draft.certifications ?? []).map((c) => ({
      ...c,
      issue_date: s(c.issue_date),
      expiration_date: s(c.expiration_date),
      credential_id: s(c.credential_id),
      credential_url: s(c.credential_url),
    })),
  };
};

/**
 * Create or update user profile
 * @param profileData - Complete profile data
 * @returns Updated profile
 */
export const saveProfile = async (profileData: UserProfile): Promise<ProfileResponse> => {
  try {
    const payload: ProfileUpdateRequest = {
      profile_data: sanitizeProfileForSave(profileData),
    };
    const response = await apiClient.put<ProfileResponse>('/profile', payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Parse CV file and extract profile data
 * @param file - PDF file to parse
 * @returns Extracted profile data
 * @throws Error if file is invalid (not PDF or exceeds size limit)
 */
export const parseCV = async (file: File): Promise<UserProfile> => {
  // Validate file type
  if (file.type !== 'application/pdf') {
    throw new Error('Seuls les fichiers PDF sont acceptés');
  }

  // Validate file size (max 10MB)
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('La taille du fichier ne doit pas dépasser 10 MB');
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<{ profile_data: UserProfile }>(
      '/profile/parse-cv',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.profile_data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
