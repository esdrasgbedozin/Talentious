/**
 * Profile Types - Talentious
 * TypeScript interfaces matching PostgreSQL JSONB schema
 * These types ensure type safety and correspond to backend Pydantic models
 */

// Personal Information
export interface PersonalInfo {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  linkedin?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
}

// Work Experience
export interface Experience {
  id: string;
  title: string;
  company: string;
  location?: string;
  start_date: string; // Format: YYYY-MM
  end_date?: string; // Format: YYYY-MM or null for current
  is_current: boolean;
  description: string;
  achievements?: string[];
}

// Education
export interface Education {
  id: string;
  degree: string;
  institution: string;
  location?: string;
  start_date: string; // Format: YYYY-MM
  end_date?: string; // Format: YYYY-MM
  field_of_study?: string;
  description?: string;
  grade?: string;
}

// Skills (separated into hard and soft)
export interface Skills {
  hard: string[]; // Technical skills (e.g., "Python", "React", "SQL")
  soft: string[]; // Soft skills (e.g., "Leadership", "Communication")
}

// Project
export interface Project {
  id: string;
  name: string;
  description: string;
  url?: string;
  start_date?: string; // Format: YYYY-MM
  end_date?: string; // Format: YYYY-MM
  technologies?: string[];
  role?: string;
}

// Certification
export interface Certification {
  id: string;
  name: string;
  issuing_organization: string;
  issue_date?: string; // Format: YYYY-MM
  expiration_date?: string; // Format: YYYY-MM or null for no expiration
  credential_id?: string;
  credential_url?: string;
}

// Master Profile (JSONB structure in PostgreSQL)
export interface UserProfile {
  personal_info: PersonalInfo;
  summary: string;
  experiences: Experience[];
  educations: Education[];
  skills: Skills;
  projects: Project[];
  certifications: Certification[];
}

// API Response types
export interface ProfileResponse {
  user_id: string;
  profile_data: UserProfile;
  updated_at: string;
}

export interface ProfileUpdateRequest {
  profile_data: UserProfile;
}

// Form validation errors
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
}

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
  projects: [],
  certifications: [],
});

// Helper to generate unique IDs
export const generateId = (): string => {
  // Use crypto.randomUUID() for guaranteed uniqueness
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments (should not happen in modern browsers)
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

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
  field_of_study: '',
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
  issuing_organization: '',
  issue_date: '',
  expiration_date: '',
  credential_id: '',
  credential_url: '',
});
