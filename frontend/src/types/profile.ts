/**
 * Profile Types - Talentious
 *
 * The data types are DERIVED from the generated OpenAPI types
 * (src/generated/api.ts), themselves generated from contracts/openapi.yaml —
 * the single source of truth. Do NOT redefine these shapes by hand; change the
 * contract and run `make generate-types` (or `npm run generate:types`).
 *
 * This module only adds frontend-specific helpers (empty factories, error shapes).
 */
import type { components } from '@/generated/api';

// Canonical data types (aliases over the generated contract types)
export type PersonalInfo = components['schemas']['PersonalInfo'];
export type Experience = components['schemas']['Experience'];
export type Education = components['schemas']['Education'];
export type Skills = components['schemas']['Skills'];
export type Project = components['schemas']['Project'];
export type Certification = components['schemas']['Certification'];
export type Language = components['schemas']['Language'];

// Master profile (JSONB structure in PostgreSQL)
export type UserProfile = components['schemas']['ProfileData'];

// API envelopes
export type ProfileResponse = components['schemas']['ProfileResponse'];
export type ProfileUpdateRequest = components['schemas']['ProfileUpdate'];

// Form validation errors (frontend-only)
export interface ProfileErrors {
  personal_info?: Partial<Record<keyof PersonalInfo, string>>;
  summary?: string;
  experiences?: Record<string, Partial<Record<keyof Experience, string>>>;
  educations?: Record<string, Partial<Record<keyof Education, string>>>;
  skills?: {
    hard?: string;
    soft?: string;
  };
  projects?: Record<string, Partial<Record<keyof Project, string>>>;
  certifications?: Record<string, Partial<Record<keyof Certification, string>>>;
  languages?: Record<string, Partial<Record<keyof Language, string>>>;
}

// Helper to generate unique IDs
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments (should not happen in modern browsers)
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

// Default empty profile
export const createEmptyProfile = (): UserProfile => ({
  personal_info: {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    linkedin: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'France',
  },
  summary: '',
  experiences: [],
  educations: [],
  skills: {
    hard: [],
    soft: [],
  },
  languages: [],
  projects: [],
  certifications: [],
});

// Create empty entities
export const createEmptyExperience = (): Experience => ({
  id: generateId(),
  title: '',
  company: '',
  location: '',
  start_date: '',
  end_date: '',
  is_current: false,
  description: '',
  achievements: [],
});

export const createEmptyEducation = (): Education => ({
  id: generateId(),
  degree: '',
  institution: '',
  location: '',
  start_date: '',
  end_date: '',
  field: '',
  description: '',
  grade: '',
});

export const createEmptyProject = (): Project => ({
  id: generateId(),
  name: '',
  description: '',
  url: '',
  start_date: '',
  end_date: '',
  technologies: [],
  role: '',
});

export const createEmptyCertification = (): Certification => ({
  id: generateId(),
  name: '',
  issuer: '',
  issue_date: '',
  expiration_date: '',
  credential_id: '',
  credential_url: '',
});

export const createEmptyLanguage = (): Language => ({
  name: '',
  level: '',
});
