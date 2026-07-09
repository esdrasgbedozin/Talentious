import { createEmptyProfile, createEmptyExperience, createEmptyEducation, createEmptyProject, createEmptyCertification, generateId } from '../profile';

describe('Profile Type Helpers', () => {
  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe('createEmptyProfile', () => {
    it('creates a profile with all required fields', () => {
      const profile = createEmptyProfile();

      expect(profile).toHaveProperty('personal_info');
      expect(profile).toHaveProperty('summary');
      expect(profile).toHaveProperty('experiences');
      expect(profile).toHaveProperty('educations');
      expect(profile).toHaveProperty('skills');
      expect(profile).toHaveProperty('projects');
      expect(profile).toHaveProperty('certifications');
    });

    it('creates empty arrays for list fields', () => {
      const profile = createEmptyProfile();

      expect(Array.isArray(profile.experiences)).toBe(true);
      expect(profile.experiences.length).toBe(0);
      expect(Array.isArray(profile.educations)).toBe(true);
      expect(profile.educations.length).toBe(0);
      expect(Array.isArray(profile.projects)).toBe(true);
      expect(profile.projects.length).toBe(0);
      expect(Array.isArray(profile.certifications)).toBe(true);
      expect(profile.certifications.length).toBe(0);
    });

    it('creates skills object with hard and soft arrays', () => {
      const profile = createEmptyProfile();

      expect(profile.skills).toHaveProperty('hard');
      expect(profile.skills).toHaveProperty('soft');
      expect(Array.isArray(profile.skills.hard)).toBe(true);
      expect(Array.isArray(profile.skills.soft)).toBe(true);
    });

    it('sets default country to France', () => {
      const profile = createEmptyProfile();

      expect(profile.personal_info.country).toBe('France');
    });
  });

  describe('createEmptyExperience', () => {
    it('creates an experience with required fields', () => {
      const experience = createEmptyExperience();

      expect(experience).toHaveProperty('id');
      expect(experience).toHaveProperty('title');
      expect(experience).toHaveProperty('company');
      expect(experience).toHaveProperty('start_date');
      expect(experience).toHaveProperty('is_current');
      expect(experience).toHaveProperty('description');
    });

    it('sets is_current to false by default', () => {
      const experience = createEmptyExperience();

      expect(experience.is_current).toBe(false);
    });

    it('creates empty achievements array', () => {
      const experience = createEmptyExperience();

      expect(Array.isArray(experience.achievements)).toBe(true);
      expect(experience.achievements?.length).toBe(0);
    });

    it('generates unique ID', () => {
      const exp1 = createEmptyExperience();
      const exp2 = createEmptyExperience();

      expect(exp1.id).not.toBe(exp2.id);
    });
  });

  describe('createEmptyEducation', () => {
    it('creates an education with required fields', () => {
      const education = createEmptyEducation();

      expect(education).toHaveProperty('id');
      expect(education).toHaveProperty('degree');
      expect(education).toHaveProperty('institution');
      expect(education).toHaveProperty('start_date');
    });

    it('generates unique ID', () => {
      const edu1 = createEmptyEducation();
      const edu2 = createEmptyEducation();

      expect(edu1.id).not.toBe(edu2.id);
    });
  });

  describe('createEmptyProject', () => {
    it('creates a project with required fields', () => {
      const project = createEmptyProject();

      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('description');
    });

    it('creates empty technologies array', () => {
      const project = createEmptyProject();

      expect(Array.isArray(project.technologies)).toBe(true);
      expect(project.technologies?.length).toBe(0);
    });

    it('generates unique ID', () => {
      const proj1 = createEmptyProject();
      const proj2 = createEmptyProject();

      expect(proj1.id).not.toBe(proj2.id);
    });
  });

  describe('createEmptyCertification', () => {
    it('creates a certification with required fields', () => {
      const certification = createEmptyCertification();

      expect(certification).toHaveProperty('id');
      expect(certification).toHaveProperty('name');
      expect(certification).toHaveProperty('issuer');
    });

    it('generates unique ID', () => {
      const cert1 = createEmptyCertification();
      const cert2 = createEmptyCertification();

      expect(cert1.id).not.toBe(cert2.id);
    });
  });
});
