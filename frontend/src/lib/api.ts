/**
 * API client configuration for Talentious
 * Axios instance with JWT authentication and error handling
 */

import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Base URL of the FastAPI backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create an Axios instance with default configuration
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // To send cookies with requests
});

// Request interceptor: Add JWT token to headers
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Retrieve the token from localStorage
    const token = localStorage.getItem('access_token');
    
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle global errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError) => {
    // If 401 error (Unauthorized), remove token and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      
      // Redirect to login (except if already on /login or /register)
      if (typeof window !== 'undefined' && 
          !window.location.pathname.includes('/login') && 
          !window.location.pathname.includes('/register')) {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// Types for API responses
/**
 * API Error response from FastAPI backend
 * @property detail - Error message from the server
 * @property [key: string] - Additional error properties (e.g., validation_error, error_code)
 * 
 * @example
 * {
 *   detail: "Invalid credentials",
 *   error_code: "AUTH_001"
 * }
 */
export interface ApiError {
  detail: string;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// Helper to extract error messages from API responses
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError;
    return apiError?.detail || error.message || 'Une erreur est survenue';
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'Une erreur inconnue est survenue';
};

// ===== CV API Types =====

/**
 * Base CV information (list view)
 */
export interface CVBase {
  id: string;
  cv_name: string;
  template_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Full CV with complete data
 */
export interface CVFull extends CVBase {
  job_offer_context: string | null;
  cv_data_json: Record<string, unknown>;
  gcs_pdf_url: string | null;
}

// ===== CV API Functions =====

/**
 * Get all CVs for the authenticated user
 * Returns array of CVs directly (backend returns list, not object)
 */
export const getCVs = async (): Promise<CVBase[]> => {
  const response = await apiClient.get<CVBase[]>('/cv');
  return response.data;
};

/**
 * Get a specific CV by ID
 */
export const getCVById = async (cvId: string): Promise<CVFull> => {
  const response = await apiClient.get<CVFull>(`/cv/${cvId}`);
  return response.data;
};

/**
 * Delete a CV by ID
 */
export const deleteCV = async (cvId: string): Promise<void> => {
  await apiClient.delete(`/cv/${cvId}`);
};

// ===== CV Generation API =====

/**
 * Request payload for CV generation
 */
export interface GenerateCVRequest {
  cv_name: string;
  offer_text: string;
}

/**
 * Response from CV generation
 */
export interface GenerateCVResponse {
  cv_id: string;
  cv_data: Record<string, unknown>;
  message: string;
}

/**
 * Generate a new CV from job offer text
 * This may take 30s-3min due to AI processing
 * 
 * @throws {AxiosError} 402 if user has no active CareerPass
 * @throws {AxiosError} 404 if user profile not found
 * @throws {AxiosError} 500/502/503 for AI service errors
 */
export const generateCV = async (data: GenerateCVRequest): Promise<GenerateCVResponse> => {
  const response = await apiClient.post<GenerateCVResponse>('/cv/generate', data);
  return response.data;
};

