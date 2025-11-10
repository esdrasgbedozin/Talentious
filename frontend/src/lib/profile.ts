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
 * Create or update user profile
 * @param profileData - Complete profile data
 * @returns Updated profile
 */
export const saveProfile = async (profileData: UserProfile): Promise<ProfileResponse> => {
  try {
    const payload: ProfileUpdateRequest = { profile_data: profileData };
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
 */
export const parseCV = async (file: File): Promise<UserProfile> => {
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
