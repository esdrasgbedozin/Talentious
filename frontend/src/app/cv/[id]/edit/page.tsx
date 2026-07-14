'use client';

/**
 * CV Editor — edit a generated CV's content (cv_data_json, ProfileData shape) with
 * a live A4 preview. Loads via getCV, saves via updateCV (PUT /cv/{id}). Reuses the
 * profile form components so the editing UX is identical to the master profile.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Printer } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ProfileSection from '@/components/profile/ProfileSection';
import SkillsInput from '@/components/profile/SkillsInput';
import ExperienceForm from '@/components/profile/ExperienceForm';
import EducationForm from '@/components/profile/EducationForm';
import ProjectForm from '@/components/profile/ProjectForm';
import CertificationForm from '@/components/profile/CertificationForm';
import CVRenderer from '@/components/cv/CVRenderer';
import { useToast } from '@/components/ui/Toast';
import {
  UserProfile,
  createEmptyProfile,
  createEmptyExperience,
  createEmptyEducation,
  createEmptyProject,
  createEmptyCertification,
} from '@/types/profile';
import { getCV, updateCV, getErrorMessage } from '@/lib/api';

export default function CVEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const cvId = params?.id;

  const [cvName, setCvName] = useState('');
  const [profile, setProfile] = useState<UserProfile>(createEmptyProfile());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the CV.
  useEffect(() => {
    if (!cvId) return;
    let cancelled = false;
    getCV(cvId)
      .then((cv) => {
        if (cancelled) return;
        setCvName(cv.cv_name);
        setProfile({ ...createEmptyProfile(), ...cv.cv_data_json });
      })
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err)))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cvId]);

  // Warn before leaving with unsaved changes (tab close / reload).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // State helpers — every mutation marks the CV dirty.
  const mutate = useCallback((updater: (prev: UserProfile) => UserProfile) => {
    setProfile(updater);
    setIsDirty(true);
  }, []);

  const updatePersonalInfo = (field: string, value: string) =>
    mutate((prev) => ({
      ...prev,
      personal_info: { ...prev.personal_info, [field]: value },
    }));
  const updateSummary = (value: string) =>
    mutate((prev) => ({ ...prev, summary: value }));
  const updateSkills = (type: 'hard' | 'soft', skills: string[]) =>
    mutate((prev) => ({ ...prev, skills: { ...prev.skills, [type]: skills } }));

  const addExperience = () =>
    mutate((prev) => ({ ...prev, experiences: [createEmptyExperience(), ...prev.experiences] }));
  const updateExperience = (id: string, field: string, value: unknown) =>
    mutate((prev) => ({
      ...prev,
      experiences: prev.experiences.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  const removeExperience = (id: string) =>
    mutate((prev) => ({ ...prev, experiences: prev.experiences.filter((e) => e.id !== id) }));

  const addEducation = () =>
    mutate((prev) => ({ ...prev, educations: [createEmptyEducation(), ...prev.educations] }));
  const updateEducation = (id: string, field: string, value: unknown) =>
    mutate((prev) => ({
      ...prev,
      educations: prev.educations.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  const removeEducation = (id: string) =>
    mutate((prev) => ({ ...prev, educations: prev.educations.filter((e) => e.id !== id) }));

  const addProject = () =>
    mutate((prev) => ({ ...prev, projects: [createEmptyProject(), ...prev.projects] }));
  const updateProject = (id: string, field: string, value: unknown) =>
    mutate((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  const removeProject = (id: string) =>
    mutate((prev) => ({ ...prev, projects: prev.projects.filter((p) => p.id !== id) }));

  const addCertification = () =>
    mutate((prev) => ({
      ...prev,
      certifications: [createEmptyCertification(), ...prev.certifications],
    }));
  const updateCertification = (id: string, field: string, value: unknown) =>
    mutate((prev) => ({
      ...prev,
      certifications: prev.certifications.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }));
  const removeCertification = (id: string) =>
    mutate((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((c) => c.id !== id),
    }));

  const handleNameChange = (value: string) => {
    setCvName(value);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!cvId) return;
    setIsSaving(true);
    try {
      await updateCV(cvId, { cv_name: cvName.trim() || 'CV sans nom', cv_data_json: profile });
      setIsDirty(false);
      toast.success('CV enregistré.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmLeave = () =>
    !isDirty ||
    window.confirm('Vous avez des modifications non sauvegardées. Quitter quand même ?');

  const handleBack = () => {
    if (confirmLeave()) router.push('/dashboard');
  };

  const handlePreview = () => {
    if (isDirty && !window.confirm('Enregistrez pour voir vos dernières modifications dans le PDF. Ouvrir l\'aperçu quand même ?')) {
      return;
    }
    router.push(`/cv/${cvId}/print?preview=1`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-light">
        <Navbar variant="authenticated" />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-action border-t-transparent" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background-light">
        <Navbar variant="authenticated" />
        <main className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="mb-6 text-text-secondary">{loadError}</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Retour au tableau de bord
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light">
      <Navbar variant="authenticated" />

      {/* Toolbar */}
      <div className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Tableau de bord</span>
          </button>
          <input
            value={cvName}
            onChange={(e) => handleNameChange(e.target.value)}
            aria-label="Nom du CV"
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-text-primary hover:border-border focus:border-action focus:bg-white focus:outline-none"
          />
          {isDirty && (
            <span className="hidden text-xs text-text-secondary sm:inline">
              Modifications non enregistrées
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Aperçu / PDF</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!isDirty || isSaving}
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-2">
        {/* Editing pane */}
        <div className="space-y-4">
          <ProfileSection
            title="Informations personnelles"
            description="Coordonnées affichées en en-tête du CV"
            defaultOpen
            isComplete={
              !!(profile.personal_info?.first_name && profile.personal_info?.last_name)
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Prénom"
                value={profile.personal_info?.first_name || ''}
                onChange={(e) => updatePersonalInfo('first_name', e.target.value)}
              />
              <Input
                label="Nom"
                value={profile.personal_info?.last_name || ''}
                onChange={(e) => updatePersonalInfo('last_name', e.target.value)}
              />
              <Input
                label="Email"
                value={profile.personal_info?.email || ''}
                onChange={(e) => updatePersonalInfo('email', e.target.value)}
              />
              <Input
                label="Téléphone"
                value={profile.personal_info?.phone || ''}
                onChange={(e) => updatePersonalInfo('phone', e.target.value)}
              />
              <Input
                label="Ville"
                value={profile.personal_info?.city || ''}
                onChange={(e) => updatePersonalInfo('city', e.target.value)}
              />
              <Input
                label="LinkedIn"
                value={profile.personal_info?.linkedin || ''}
                onChange={(e) => updatePersonalInfo('linkedin', e.target.value)}
              />
            </div>
          </ProfileSection>

          <ProfileSection
            title="Profil"
            description="Résumé d'accroche en haut du CV"
            defaultOpen
            isComplete={(profile.summary?.trim().length || 0) > 0}
          >
            <textarea
              value={profile.summary || ''}
              onChange={(e) => updateSummary(e.target.value)}
              rows={5}
              placeholder="Résumé professionnel percutant en 2-3 phrases…"
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action"
            />
          </ProfileSection>

          <ProfileSection
            title="Expériences professionnelles"
            isComplete={profile.experiences.length > 0}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addExperience}>
                  + Ajouter une expérience
                </Button>
              </div>
              {profile.experiences.map((exp) => (
                <ExperienceForm
                  key={exp.id}
                  experience={exp}
                  onChange={(field, value) => updateExperience(exp.id, field, value)}
                  onRemove={() => removeExperience(exp.id)}
                />
              ))}
            </div>
          </ProfileSection>

          <ProfileSection title="Formation" isComplete={profile.educations.length > 0}>
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addEducation}>
                  + Ajouter une formation
                </Button>
              </div>
              {profile.educations.map((edu) => (
                <EducationForm
                  key={edu.id}
                  education={edu}
                  onChange={(field, value) => updateEducation(edu.id, field, value)}
                  onRemove={() => removeEducation(edu.id)}
                />
              ))}
            </div>
          </ProfileSection>

          <ProfileSection
            title="Compétences"
            isComplete={
              (profile.skills?.hard.length || 0) + (profile.skills?.soft.length || 0) > 0
            }
          >
            <div className="space-y-4">
              <SkillsInput
                label="Compétences techniques"
                skills={profile.skills?.hard || []}
                onChange={(skills) => updateSkills('hard', skills)}
              />
              <SkillsInput
                label="Compétences transversales"
                skills={profile.skills?.soft || []}
                onChange={(skills) => updateSkills('soft', skills)}
              />
            </div>
          </ProfileSection>

          <ProfileSection title="Projets" isComplete={profile.projects.length > 0}>
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addProject}>
                  + Ajouter un projet
                </Button>
              </div>
              {profile.projects.map((proj) => (
                <ProjectForm
                  key={proj.id}
                  project={proj}
                  onChange={(field, value) => updateProject(proj.id, field, value)}
                  onRemove={() => removeProject(proj.id)}
                />
              ))}
            </div>
          </ProfileSection>

          <ProfileSection
            title="Certifications"
            isComplete={profile.certifications.length > 0}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={addCertification}>
                  + Ajouter une certification
                </Button>
              </div>
              {profile.certifications.map((cert) => (
                <CertificationForm
                  key={cert.id}
                  certification={cert}
                  onChange={(field, value) => updateCertification(cert.id, field, value)}
                  onRemove={() => removeCertification(cert.id)}
                />
              ))}
            </div>
          </ProfileSection>
        </div>

        {/* Live preview pane */}
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <p className="mb-3 text-sm font-medium text-text-secondary">Aperçu en direct</p>
            <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              <div style={{ zoom: 0.62 }}>
                <CVRenderer profile={profile} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
