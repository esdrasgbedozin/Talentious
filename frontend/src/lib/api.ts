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

