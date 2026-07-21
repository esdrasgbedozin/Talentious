'use client';

/**
 * Profile Page - Talentious
 * Master Profile - Central data source for all CV generation
 * Ultra-professional, extensible, and perfectly organized
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ProfileSection from '@/components/profile/ProfileSection';
import SkillsInput from '@/components/profile/SkillsInput';
import ExperienceForm from '@/components/profile/ExperienceForm';
import EducationForm from '@/components/profile/EducationForm';
import ProjectForm from '@/components/profile/ProjectForm';
import CertificationForm from '@/components/profile/CertificationForm';
import {
  UserProfile,
  createEmptyProfile,
  createEmptyExperience,
  createEmptyEducation,
  createEmptyProject,
  createEmptyCertification,
} from '@/types/profile';
import { getProfile, saveProfile, draftToFormProfile } from '@/lib/profile';

// Validation constants
const MIN_SUMMARY_LENGTH_COMPLETE = 50; // Minimum for profile completeness
const MIN_SUMMARY_LENGTH_RECOMMENDED = 100; // Recommended minimum for quality
const SUCCESS_MESSAGE_DURATION = 5000; // milliseconds

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(createEmptyProfile());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Brouillon issu de l'import PDF (onboarding) : affiché pour RELECTURE,
  // rien n'est enregistré tant que l'utilisateur ne sauvegarde pas lui-même.
  const [importWarnings, setImportWarnings] = useState<string[] | null>(null);

  // Load profile on mount — an imported draft (sessionStorage) takes precedence
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true);

        // Le brouillon n'est PAS consommé ici : il survit jusqu'à la
        // sauvegarde (ou au rejet explicite). Rend l'effet idempotent — en dev,
        // React Strict Mode exécute l'effet deux fois, et une consommation à la
        // lecture faisait écraser le brouillon par le profil serveur au 2e tour.
        const rawDraft = sessionStorage.getItem('imported_profile_draft');
        if (rawDraft) {
          try {
            const draft = JSON.parse(rawDraft);
            setProfile(draftToFormProfile(draft.profile_data));
            setImportWarnings(
              Array.isArray(draft.warnings) ? draft.warnings : [],
            );
            return; // le brouillon remplace le formulaire (non sauvegardé)
          } catch {
            console.warn('Brouillon importé illisible — chargement du profil normal');
          }
        }

        const data = await getProfile();
        setProfile(data.profile_data);
      } catch {
        // Profile doesn't exist yet (404) - use empty profile
        console.log('No profile found, using empty profile');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Auto-hide success message after configured duration
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), SUCCESS_MESSAGE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Save profile
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      await saveProfile(profile);
      
      setSuccessMessage('Profil sauvegardé avec succès !');
      setImportWarnings(null); // le brouillon importé est désormais enregistré
      sessionStorage.removeItem('imported_profile_draft');
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      // The error banner lives at the top of the page — without this scroll a
      // failed save is INVISIBLE from the sticky footer (real bug: the user
      // thought the save silently did nothing).
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSaving(false);
    }
  };

  // Update personal info
  const updatePersonalInfo = (field: string, value: string) => {
    setProfile(prev => ({
      ...prev,
      personal_info: {
        ...prev.personal_info,
        [field]: value,
      },
    }));
  };

  // Update summary
  const updateSummary = (value: string) => {
    setProfile(prev => ({ ...prev, summary: value }));
  };

  // Update skills
  const updateSkills = (type: 'hard' | 'soft', skills: string[]) => {
    setProfile(prev => ({
      ...prev,
      skills: {
        ...prev.skills,
        [type]: skills,
      },
    }));
  };

  // Experience management
  const addExperience = () => {
    setProfile(prev => ({
      ...prev,
      experiences: [createEmptyExperience(), ...prev.experiences],
    }));
  };

  const updateExperience = (id: string, field: string, value: unknown) => {
    setProfile(prev => ({
      ...prev,
      experiences: prev.experiences.map(exp =>
        exp.id === id ? { ...exp, [field]: value } : exp
      ),
    }));
  };

  const removeExperience = (id: string) => {
    setProfile(prev => ({
      ...prev,
      experiences: prev.experiences.filter(exp => exp.id !== id),
    }));
  };

  // Education management
  const addEducation = () => {
    setProfile(prev => ({
      ...prev,
      educations: [createEmptyEducation(), ...prev.educations],
    }));
  };

  const updateEducation = (id: string, field: string, value: unknown) => {
    setProfile(prev => ({
      ...prev,
      educations: prev.educations.map(edu =>
        edu.id === id ? { ...edu, [field]: value } : edu
      ),
    }));
  };

  const removeEducation = (id: string) => {
    setProfile(prev => ({
      ...prev,
      educations: prev.educations.filter(edu => edu.id !== id),
    }));
  };

  // Project management
  const addProject = () => {
    setProfile(prev => ({
      ...prev,
      projects: [createEmptyProject(), ...prev.projects],
    }));
  };

  const updateProject = (id: string, field: string, value: unknown) => {
    setProfile(prev => ({
      ...prev,
      projects: prev.projects.map(proj =>
        proj.id === id ? { ...proj, [field]: value } : proj
      ),
    }));
  };

  const removeProject = (id: string) => {
    setProfile(prev => ({
      ...prev,
      projects: prev.projects.filter(proj => proj.id !== id),
    }));
  };

  // Certification management
  const addCertification = () => {
    setProfile(prev => ({
      ...prev,
      certifications: [createEmptyCertification(), ...prev.certifications],
    }));
  };

  const updateCertification = (id: string, field: string, value: unknown) => {
    setProfile(prev => ({
      ...prev,
      certifications: prev.certifications.map(cert =>
        cert.id === id ? { ...cert, [field]: value } : cert
      ),
    }));
  };

  const removeCertification = (id: string) => {
    setProfile(prev => ({
      ...prev,
      certifications: prev.certifications.filter(cert => cert.id !== id),
    }));
  };

  // Check if sections are complete (for visual indicators)
  const isPersonalInfoComplete = () => {
    return !!(
      profile?.personal_info?.first_name &&
      profile?.personal_info?.last_name &&
      profile?.personal_info?.email
    );
  };

  const isSummaryComplete = () => (profile?.summary?.trim()?.length || 0) > MIN_SUMMARY_LENGTH_COMPLETE;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-action mx-auto"></div>
          <p className="mt-4 text-text-secondary">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar variant="authenticated" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-text-primary mb-3">
            Mon Profil Maître
          </h1>
          <p className="text-lg text-text-secondary">
            Votre source de vérité unique pour tous vos CVs. Remplissez votre profil une fois, 
            générez des CVs adaptés à l&apos;infini.
          </p>
        </div>

        {/* Success/Error Messages */}
        {importWarnings !== null && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">
              📄 Profil importé depuis ton PDF — rien n&apos;est encore enregistré.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Relis chaque section, corrige ce qui doit l&apos;être, puis clique sur
              « Sauvegarder mon profil » en bas de page.
            </p>
            {importWarnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
                {importWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={async () => {
                sessionStorage.removeItem('imported_profile_draft');
                setImportWarnings(null);
                try {
                  const data = await getProfile();
                  setProfile(data.profile_data);
                } catch {
                  setProfile(createEmptyProfile());
                }
              }}
              className="mt-3 text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
            >
              Ignorer l&apos;import et revenir à mon profil actuel
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3 animate-fadeIn">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-green-800 font-medium">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Profile Sections */}
        <div className="space-y-6">
          {/* 1. Personal Information */}
          <ProfileSection
            title="Informations Personnelles"
            description="Vos coordonnées et informations de contact"
            defaultOpen={true}
            isComplete={isPersonalInfoComplete()}
            icon={
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
          >
            <div className="grid md:grid-cols-2 gap-6">
              <Input
                label="Prénom *"
                value={profile.personal_info.first_name}
                onChange={(e) => updatePersonalInfo('first_name', e.target.value)}
                placeholder="Jean"
              />
              <Input
                label="Nom *"
                value={profile.personal_info.last_name}
                onChange={(e) => updatePersonalInfo('last_name', e.target.value)}
                placeholder="Dupont"
              />
              <Input
                label="Email *"
                type="email"
                value={profile.personal_info.email}
                onChange={(e) => updatePersonalInfo('email', e.target.value)}
                placeholder="jean.dupont@example.com"
              />
              <Input
                label="Téléphone"
                type="tel"
                value={profile.personal_info.phone || ''}
                onChange={(e) => updatePersonalInfo('phone', e.target.value)}
                placeholder="+33 6 12 34 56 78"
              />
              <Input
                label="LinkedIn"
                value={profile.personal_info.linkedin || ''}
                onChange={(e) => updatePersonalInfo('linkedin', e.target.value)}
                placeholder="linkedin.com/in/jeandupont"
              />
              <Input
                label="Adresse"
                value={profile.personal_info.address || ''}
                onChange={(e) => updatePersonalInfo('address', e.target.value)}
                placeholder="123 Rue de la République"
              />
              <Input
                label="Ville"
                value={profile.personal_info.city || ''}
                onChange={(e) => updatePersonalInfo('city', e.target.value)}
                placeholder="Paris"
              />
              <Input
                label="Code Postal"
                value={profile.personal_info.postal_code || ''}
                onChange={(e) => updatePersonalInfo('postal_code', e.target.value)}
                placeholder="75001"
              />
            </div>
          </ProfileSection>

          {/* 2. Professional Summary */}
          <ProfileSection
            title="Résumé Professionnel"
            description="Votre pitch en 2-3 phrases (recommandé: 100-200 mots)"
            isComplete={isSummaryComplete()}
            icon={
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          >
            <div>
              <textarea
                value={profile.summary}
                onChange={(e) => updateSummary(e.target.value)}
                placeholder="Décrivez votre parcours, vos compétences clés et ce que vous recherchez..."
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent resize-none"
              />
              <p className="mt-2 text-sm text-text-secondary">
                {profile?.summary?.length || 0} caractères
                {(profile?.summary?.length || 0) > 0 && (profile?.summary?.length || 0) < MIN_SUMMARY_LENGTH_RECOMMENDED && (
                  <span className="ml-2 text-orange-600">• Trop court (minimum recommandé: {MIN_SUMMARY_LENGTH_RECOMMENDED})</span>
                )}
              </p>
            </div>
          </ProfileSection>

          {/* Section 3: Professional Experiences */}
          <ProfileSection
            title="Expériences professionnelles"
            description="Détaillez votre parcours professionnel"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            isComplete={(profile?.experiences?.length || 0) > 0 && (profile?.experiences?.every(exp => exp.title && exp.company) || false)}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addExperience}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Ajouter une expérience
                </Button>
              </div>
              
              {(profile?.experiences?.length || 0) === 0 ? (
                <div className="text-center py-12 bg-background-light rounded-lg border-2 border-dashed border-gray-300">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2 text-text-secondary">Aucune expérience ajoutée</p>
                  <p className="text-sm text-text-secondary">Cliquez sur &ldquo;Ajouter une expérience&rdquo; pour commencer</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(profile?.experiences || []).map((exp) => (
                    <ExperienceForm
                      key={exp.id}
                      experience={exp}
                      onChange={(field, value) => updateExperience(exp.id, field, value)}
                      onRemove={() => removeExperience(exp.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ProfileSection>

          {/* Section 4: Education */}
          <ProfileSection
            title="Formation"
            description="Votre parcours académique et vos diplômes"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
              </svg>
            }
            isComplete={(profile?.educations?.length || 0) > 0 && (profile?.educations?.every(edu => edu.degree && edu.institution) || false)}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addEducation}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Ajouter une formation
                </Button>
              </div>
              
              {(profile?.educations?.length || 0) === 0 ? (
                <div className="text-center py-12 bg-background-light rounded-lg border-2 border-dashed border-gray-300">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  </svg>
                  <p className="mt-2 text-text-secondary">Aucune formation ajoutée</p>
                  <p className="text-sm text-text-secondary">Cliquez sur &ldquo;Ajouter une formation&rdquo; pour commencer</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(profile?.educations || []).map((edu) => (
                    <EducationForm
                      key={edu.id}
                      education={edu}
                      onChange={(field, value) => updateEducation(edu.id, field, value)}
                      onRemove={() => removeEducation(edu.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ProfileSection>

          {/* Section 5: Skills */}
          <ProfileSection
            title="Compétences"
            description="Vos compétences techniques et soft skills"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
            isComplete={((profile?.skills?.hard?.length || 0) > 0 || (profile?.skills?.soft?.length || 0) > 0)}
          >
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Compétences techniques (Hard Skills)
                </label>
                <SkillsInput
                  skills={profile?.skills?.hard || []}
                  onChange={(skills) => updateSkills('hard', skills)}
                  placeholder="Ex: React, Python, SQL... (Appuyez sur Entrée pour ajouter)"
                />
                <p className="mt-2 text-sm text-text-secondary">
                  {profile?.skills?.hard?.length || 0}/20 compétences techniques
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Compétences comportementales (Soft Skills)
                </label>
                <SkillsInput
                  skills={profile?.skills?.soft || []}
                  onChange={(skills) => updateSkills('soft', skills)}
                  placeholder="Ex: Leadership, Communication, Travail d'équipe... (Appuyez sur Entrée pour ajouter)"
                />
                <p className="mt-2 text-sm text-text-secondary">
                  {profile?.skills?.soft?.length || 0}/20 compétences comportementales
                </p>
              </div>
            </div>
          </ProfileSection>

          {/* Section 6: Projects */}
          <ProfileSection
            title="Projets"
            description="Vos projets professionnels et personnels remarquables"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
            isComplete={(profile?.projects?.length || 0) > 0 && (profile?.projects?.every(proj => proj.name && proj.description) || false)}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addProject}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Ajouter un projet
                </Button>
              </div>
              
              {(profile?.projects?.length || 0) === 0 ? (
                <div className="text-center py-12 bg-background-light rounded-lg border-2 border-dashed border-gray-300">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="mt-2 text-text-secondary">Aucun projet ajouté</p>
                  <p className="text-sm text-text-secondary">Cliquez sur &ldquo;Ajouter un projet&rdquo; pour commencer</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(profile?.projects || []).map((proj) => (
                    <ProjectForm
                      key={proj.id}
                      project={proj}
                      onChange={(field, value) => updateProject(proj.id, field, value)}
                      onRemove={() => removeProject(proj.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ProfileSection>

          {/* Section 7: Certifications */}
          <ProfileSection
            title="Certifications"
            description="Vos certifications et accréditations professionnelles"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            }
            isComplete={(profile?.certifications?.length || 0) > 0 && (profile?.certifications?.every(cert => cert.name && cert.issuer) || false)}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addCertification}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Ajouter une certification
                </Button>
              </div>
              
              {(profile?.certifications?.length || 0) === 0 ? (
                <div className="text-center py-12 bg-background-light rounded-lg border-2 border-dashed border-gray-300">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  <p className="mt-2 text-text-secondary">Aucune certification ajoutée</p>
                  <p className="text-sm text-text-secondary">Cliquez sur &ldquo;Ajouter une certification&rdquo; pour commencer</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(profile?.certifications || []).map((cert) => (
                    <CertificationForm
                      key={cert.id}
                      certification={cert}
                      onChange={(field, value) => updateCertification(cert.id, field, value)}
                      onRemove={() => removeCertification(cert.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ProfileSection>

        </div>

        {/* Save Button - Sticky Footer */}
        <div className="sticky bottom-0 left-0 right-0 mt-12 bg-gradient-to-t from-white via-white to-transparent pt-8 pb-6">
          <div className="max-w-5xl mx-auto flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <button
              onClick={() => router.push('/cvs')}
              className="text-center font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              ← Retour à mes CVs
            </button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sauvegarde en cours...
                </span>
              ) : (
                'Sauvegarder mon profil'
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
