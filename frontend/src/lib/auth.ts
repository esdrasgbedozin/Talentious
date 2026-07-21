/**
 * Authentication functions for Talentious
 * Handles login, register, logout, and user session
 */

import { apiClient, getErrorMessage } from './api';

// Types for authentication
export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  email_verified?: boolean;
  display_name?: string | null;
  created_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

/**
 * User login
 */
export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  try {
    // FastAPI expects credentials in application/x-www-form-urlencoded for OAuth2
    const formData = new URLSearchParams();
    formData.append('username', credentials.email); // OAuth2 utilise 'username'
    formData.append('password', credentials.password);
    
    const response = await apiClient.post<AuthResponse>('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    // Store the token
    localStorage.setItem('access_token', response.data.access_token);
    
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * User registration
 */
export const register = async (credentials: RegisterCredentials): Promise<{ message: string }> => {
  try {
    const response = await apiClient.post('/auth/register', credentials);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Get the logged-in user's information
 */
export const getMe = async (): Promise<User> => {
  try {
    const response = await apiClient.get<User>('/auth/me');
    
    // Store the user locally
    localStorage.setItem('user', JSON.stringify(response.data));
    
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Logout
 */
export const logout = async (): Promise<void> => {
  // Revoke the refresh token server-side (best-effort — the httpOnly cookie is
  // sent automatically). Proceed with local teardown even if the call fails.
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // ignore — the session is being torn down regardless
  }

  // Remove the token and user
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');

  // Redirect to the homepage
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
};

/**
 * Check if the user is authenticated
 */
export const isAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('access_token');
};

/**
 * Get the user from localStorage
 */
export const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr) as User;
  } catch {
    return null;
  }
};
