/**
 * API client configuration for Talentious
 * Axios instance with JWT authentication and error handling
 */

import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { UserProfile } from '@/types/profile';
import { normalizeCVData } from '@/lib/cv';

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

/**
 * Silent refresh: exchange the httpOnly refresh cookie for a fresh access token.
 * A single in-flight promise is shared so concurrent 401s trigger only one
 * refresh. Uses a bare axios call (not apiClient) to avoid interceptor recursion.
 */
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ access_token: string }>(`${API_URL}/auth/refresh`, null, {
        withCredentials: true,
      })
      .then((res) => {
        const token = res.data.access_token;
        localStorage.setItem('access_token', token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function clearLocalSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  // Also clear the middleware session cookie: otherwise the route guard still
  // sees a "session", bounces /login → /onboarding → /profile, and the expired
  // token re-triggers this 401 — an infinite redirect loop.
  if (typeof document !== 'undefined') {
    document.cookie =
      'talentious_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
}

// Response interceptor: silent token refresh on 401, then global error handling.
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthEndpoint =
      url.includes('/auth/refresh') || url.includes('/auth/login');

    if (status === 401) {
      // First 401 on a normal request: try a silent refresh, then replay once.
      if (original && !original._retry && !isAuthEndpoint) {
        original._retry = true;
        try {
          const token = await refreshAccessToken();
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${token}`;
          return apiClient(original);
        } catch {
          // Refresh failed → fall through to session teardown.
        }
      }

      // Refresh unavailable or failed: clear the session and bounce to login.
      clearLocalSession();
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('/login') &&
        !window.location.pathname.includes('/register')
      ) {
        window.location.href = '/login';
      }
    }

    // If 402 (Payment Required), the user needs an active CareerPass → billing.
    if (
      status === 402 &&
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
 * Permanently and irreversibly erase the current account and all its data
 * (RGPD Art. 17). Backend: DELETE /users/me → 204. The caller is responsible for
 * clearing the local session and redirecting afterwards.
 */
export const deleteAccount = async (): Promise<void> => {
  await apiClient.delete('/users/me');
};

/** Confirm an email address from the token in the verification link. */
export const verifyEmail = async (token: string): Promise<void> => {
  await apiClient.post('/auth/verify-email', { token });
};

/** Resend the verification email to the current (authenticated) user. */
export const resendVerification = async (): Promise<void> => {
  await apiClient.post('/auth/resend-verification');
};

export interface CVDetail extends CVBase {
  job_offer_context: string | null;
  cv_data_json: UserProfile;
  gcs_pdf_url: string | null;
}

/** Fetch a single CV, normalizing its content to canonical ProfileData. */
export const getCV = async (cvId: string): Promise<CVDetail> => {
  const { data } = await apiClient.get<CVDetail>(`/cv/${cvId}`);
  return { ...data, cv_data_json: normalizeCVData(data.cv_data_json) };
};

/** Update a CV's name and/or content (PUT /cv/{id}). */
export const updateCV = async (
  cvId: string,
  payload: { cv_name?: string; cv_data_json?: UserProfile },
): Promise<CVDetail> => {
  const { data } = await apiClient.put<CVDetail>(`/cv/${cvId}`, payload);
  return data;
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

export interface CatalogEntry {
  pass_type: PassType;
  duration_days: number;
  /** Price in the currency's minor unit (cents). Null when Stripe is unconfigured. */
  amount_cents: number | null;
  /** ISO 4217 lowercase code (e.g. "eur"). Null when unknown. */
  currency: string | null;
}

export interface BillingCatalog {
  passes: CatalogEntry[];
}

/** Purchasable passes with their live Stripe price (amount may be null). */
export const getBillingCatalog = async (): Promise<BillingCatalog> => {
  const { data } = await apiClient.get<BillingCatalog>('/billing/catalog');
  return data;
};

/** Format a catalog price for display, or a fallback when the amount is unknown. */
export const formatPrice = (
  amountCents: number | null,
  currency: string | null,
): string | null => {
  if (amountCents == null || currency == null) return null;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
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

