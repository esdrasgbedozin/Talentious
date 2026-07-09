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

    // If 402 (Payment Required), the user needs an active CareerPass → billing.
    if (
      error.response?.status === 402 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.includes('/billing')
    ) {
      window.location.href = '/billing';
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

// ===== CV =====

export interface CVBase {
  id: string;
  cv_name: string;
  template_id: string;
  created_at: string;
  updated_at: string;
}

export interface GenerateCVRequest {
  cv_name: string;
  offer_text: string;
}

export interface GenerateCVResult {
  cv_id: string;
}

export interface CVJobStatus {
  job_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress_pct: number | null;
  cv_id: string | null;
  error_message: string | null;
}

/** Submit a generation job (returns immediately with the job id). */
export const startGeneration = async (
  data: GenerateCVRequest,
): Promise<{ job_id: string; status: string }> => {
  const { data: job } = await apiClient.post<{ job_id: string; status: string }>(
    '/cv/generate',
    data,
  );
  return job;
};

/** Fetch the current status of a generation job. */
export const getJobStatus = async (jobId: string): Promise<CVJobStatus> => {
  const { data } = await apiClient.get<CVJobStatus>(`/cv/jobs/${jobId}`);
  return data;
};

/** List the current user's generated CVs. */
export const getCVs = async (): Promise<CVBase[]> => {
  const { data } = await apiClient.get<CVBase[]>('/cv');
  return data;
};

/** Delete a CV by id. */
export const deleteCV = async (cvId: string): Promise<void> => {
  await apiClient.delete(`/cv/${cvId}`);
};

/**
 * Generate a CV: submit the async job then poll until it succeeds or fails.
 * Resolves with the created cv_id, or throws with a safe error message.
 */
export const generateCV = async (
  data: GenerateCVRequest,
): Promise<GenerateCVResult> => {
  const { data: job } = await apiClient.post<{ job_id: string; status: string }>(
    '/cv/generate',
    data,
  );
  const jobId = job.job_id;

  // Poll ~6 min max (120 × 3s). The backend runs the AI pipeline in the background.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const { data: status } = await apiClient.get<CVJobStatus>(
      `/cv/jobs/${jobId}`,
    );
    if (status.status === 'succeeded' && status.cv_id) {
      return { cv_id: status.cv_id };
    }
    if (status.status === 'failed') {
      throw new Error(status.error_message || 'La génération a échoué.');
    }
  }
  throw new Error('La génération a pris trop de temps. Réessayez.');
};

// ===== Billing (Stripe) =====

export type PassType = 'PASS_30_DAYS' | 'PASS_90_DAYS';

export interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
}

export interface BillingStatus {
  has_active_pass: boolean;
  valid_until: string | null;
}

/** Start a Stripe Checkout for the given pass and return the redirect URL. */
export const createCheckoutSession = async (
  passType: PassType,
): Promise<CheckoutSessionResponse> => {
  const { data } = await apiClient.post<CheckoutSessionResponse>(
    '/billing/checkout-session',
    { pass_type: passType },
  );
  return data;
};

/** Whether the current user holds an active CareerPass. */
export const getBillingStatus = async (): Promise<BillingStatus> => {
  const { data } = await apiClient.get<BillingStatus>('/billing/status');
  return data;
};

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

