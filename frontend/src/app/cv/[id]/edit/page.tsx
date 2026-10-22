'use client';

/**
 * CV Editor — edit a generated CV's content with a live A4 preview.
 *
 * The editor state IS the canonical `GeneratedCVData` (M0-T08c, ADR-CONTENT-SCHEMA):
 * loaded via getCV (a legacy V1 CV is bridged once, read-side), edited through
 * dedicated canonical forms, and saved AS IS via updateCV (PUT /cv expects this
 * exact shape). Per-experience highlighted_skills are editable and survive the
 * whole cycle. The preview renders the exact save payload (aperçu = PDF).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Printer } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ProfileSection from '@/components/profile/ProfileSection';
import SkillsInput from '@/components/profile/SkillsInput';
import CVExperienceForm from '@/components/cv/CVExperienceForm';
import CVEducationForm from '@/components/cv/CVEducationForm';
import CVProjectForm from '@/components/cv/CVProjectForm';
import CVCertificationForm from '@/components/cv/CVCertificationForm';
import {
  FALLBACK_TEMPLATE_ID,
  getTemplate,
  type GeneratedCVData,
} from '@talentious/cv-render';
import { useToast } from '@/components/ui/Toast';
import { getCV, updateCV, getErrorMessage } from '@/lib/api';
import {
  CV_SAVE_MAX_SKILLS,
  createEmptyCVData,
  createEmptyCVExperience,
  createEmptyCVEducation,
  createEmptyCVProject,
  createEmptyCVCertification,
  ensureCVShape,
  skillNames,
  withSkillNames,
  sanitizeCVForSave,
  validateCVForSave,
} from '@/lib/cvEditor';

type ListKey =
  | 'selected_experiences'
  | 'selected_educations'
  | 'selected_projects'
  | 'selected_certifications';

export default function CVEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const cvId = params?.id;

  const [cvName, setCvName] = useState('');
  const [cv, setCv] = useState<GeneratedCVData>(createEmptyCVData());
  // Enveloppe du document : le template est résolu par le registre (M0-T12,
  // ADR-TEMPLATE-REGISTRY), jamais mappé ici. Repli sûr tant que rien n'est chargé.
  const [templateId, setTemplateId] = useState<string>(FALLBACK_TEMPLATE_ID);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the CV — getCV returns the canonical content; ensureCVShape only
  // fills missing lists (raw V1 CVs stored before the coercion belt).
  useEffect(() => {
    if (!cvId) return;
    let cancelled = false;
    getCV(cvId)
      .then((detail) => {
        if (cancelled) return;
        setCvName(detail.cv_name);
        setTemplateId(detail.template_id);
        setCv(ensureCVShape(detail.cv_data_json));
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
  const mutate = useCallback((updater: (prev: GeneratedCVData) => GeneratedCVData) => {
    setCv(updater);
    setIsDirty(true);
  }, []);

  const updatePersonalInfo = (field: string, value: string) =>
    mutate((prev) => ({
      ...prev,
      personal_info: { ...prev.personal_info, [field]: value },
    }));
  const updateSummary = (value: string) => mutate((prev) => ({ ...prev, summary: value }));
  const updateSkills = (category: 'hard_skill' | 'soft_skill', names: string[]) =>
    mutate((prev) => ({
      ...prev,
      highlighted_skills: withSkillNames(prev.highlighted_skills, names, category),
    }));

  const addItem = <K extends ListKey>(key: K, item: GeneratedCVData[K][number]) =>
    mutate((prev) => ({ ...prev, [key]: [item, ...prev[key]] }));
  const updateItem = (key: ListKey, id: string, field: string, value: unknown) =>
    mutate((prev) => ({
      ...prev,
      [key]: prev[key].map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  const removeItem = (key: ListKey, id: string) =>
    mutate((prev) => ({ ...prev, [key]: prev[key].filter((item) => item.id !== id) }));

  const handleNameChange = (value: string) => {
    setCvName(value);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!cvId) return;
    // Bloque les saves qui perdraient des entrées en silence (la coercition
    // backend écarte toute expérience sans date AAAA-MM, etc. — M0-T08a).
    const problems = validateCVForSave(cv);
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateCV(cvId, {
        cv_name: cvName.trim() || 'CV sans nom',
        cv_data_json: sanitizeCVForSave(cv),
      });
      // Resynchronise l'éditeur sur ce qui est RÉELLEMENT stocké : toute entrée
      // écartée ou tronquée par la coercition backend devient visible
      // immédiatement, pas au rechargement.
      setCv(ensureCVShape(updated.cv_data_json));
      setCvName(updated.cv_name);
      setIsDirty(false);
      toast.success('CV enregistré.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // L'aperçu rend EXACTEMENT le payload du save (aperçu = PDF). Mémoïsé pour ne
  // pas recréer l'objet (et re-déclencher la mesure du renderer) inutilement.
  const previewCv = useMemo(() => sanitizeCVForSave(cv), [cv]);
  const Template = getTemplate(templateId);

  const hardSkills = useMemo(() => skillNames(cv.highlighted_skills, 'hard_skill'), [cv]);
  const softSkills = useMemo(() => skillNames(cv.highlighted_skills, 'soft_skill'), [cv]);

  const confirmLeave = () =>
    !isDirty ||
    window.confirm('Vous avez des modifications non sauvegardées. Quitter quand même ?');

  const handleBack = () => {
    if (confirmLeave()) router.push('/cvs');
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
          <Button variant="outline" onClick={() => router.push('/cvs')}>
            Retour à mes CVs
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
            <span className="hidden sm:inline">Mes CVs</span>
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
            isComplete={!!(cv.personal_info.first_name && cv.personal_info.last_name)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Prénom"
                value={cv.personal_info.first_name || ''}
                onChange={(e) => updatePersonalInfo('first_name', e.target.value)}
              />
              <Input
                label="Nom"
                value={cv.personal_info.last_name || ''}
                onChange={(e) => updatePersonalInfo('last_name', e.target.value)}
              />
              <Input
                label="Email"
                value={cv.personal_info.email || ''}
                onChange={(e) => updatePersonalInfo('email', e.target.value)}
              />
              <Input
                label="Téléphone"
                value={cv.personal_info.phone || ''}
                onChange={(e) => updatePersonalInfo('phone', e.target.value)}
              />
              <Input
                label="Ville"
                value={cv.personal_info.city || ''}
                onChange={(e) => updatePersonalInfo('city', e.target.value)}
              />
              <Input
                label="LinkedIn"
                value={cv.personal_info.linkedin || ''}
                onChange={(e) => updatePersonalInfo('linkedin', e.target.value)}
              />
            </div>
          </ProfileSection>

          <ProfileSection
            title="Profil"
            description="Résumé d'accroche en haut du CV"
            defaultOpen
            isComplete={(cv.summary?.trim().length || 0) > 0}
          >
            <textarea
              value={cv.summary || ''}
              onChange={(e) => updateSummary(e.target.value)}
              rows={5}
              placeholder="Résumé professionnel percutant en 2-3 phrases…"
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-action"
            />
          </ProfileSection>

          <ProfileSection
            title="Expériences professionnelles"
            isComplete={cv.selected_experiences.length > 0}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => addItem('selected_experiences', createEmptyCVExperience())}
                >
                  + Ajouter une expérience
                </Button>
              </div>
              {cv.selected_experiences.map((exp) => (
                <CVExperienceForm
                  key={exp.id}
                  experience={exp}
                  onChange={(field, value) =>
                    updateItem('selected_experiences', exp.id, field, value)
                  }
                  onRemove={() => removeItem('selected_experiences', exp.id)}
                />
              ))}
            </div>
          </ProfileSection>

          <ProfileSection title="Formation" isComplete={cv.selected_educations.length > 0}>
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => addItem('selected_educations', createEmptyCVEducation())}
                >
                  + Ajouter une formation
                </Button>
              </div>
              {cv.selected_educations.map((edu) => (
                <CVEducationForm
                  key={edu.id}
                  education={edu}
                  onChange={(field, value) =>
                    updateItem('selected_educations', edu.id, field, value)
                  }
                  onRemove={() => removeItem('selected_educations', edu.id)}
                />
              ))}
            </div>
          </ProfileSection>

          <ProfileSection
            title="Compétences"
            isComplete={cv.highlighted_skills.length > 0}
          >
            <div className="space-y-4">
              <SkillsInput
                label="Compétences techniques"
                skills={hardSkills}
                onChange={(names) => updateSkills('hard_skill', names)}
                maxSkills={CV_SAVE_MAX_SKILLS}
              />
              <SkillsInput
                label="Compétences transversales"
                skills={softSkills}
                onChange={(names) => updateSkills('soft_skill', names)}
                maxSkills={CV_SAVE_MAX_SKILLS}
              />
            </div>
          </ProfileSection>

          <ProfileSection title="Projets" isComplete={cv.selected_projects.length > 0}>
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => addItem('selected_projects', createEmptyCVProject())}
                >
                  + Ajouter un projet
                </Button>
              </div>
              {cv.selected_projects.map((proj) => (
                <CVProjectForm
                  key={proj.id}
                  project={proj}
                  onChange={(field, value) =>
                    updateItem('selected_projects', proj.id, field, value)
                  }
                  onRemove={() => removeItem('selected_projects', proj.id)}
                />
              ))}
            </div>
          </ProfileSection>

          <ProfileSection
            title="Certifications"
            isComplete={cv.selected_certifications.length > 0}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    addItem('selected_certifications', createEmptyCVCertification())
                  }
                >
                  + Ajouter une certification
                </Button>
              </div>
              {cv.selected_certifications.map((cert) => (
                <CVCertificationForm
                  key={cert.id}
                  certification={cert}
                  onChange={(field, value) =>
                    updateItem('selected_certifications', cert.id, field, value)
                  }
                  onRemove={() => removeItem('selected_certifications', cert.id)}
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
                {/* eslint-disable-next-line react-hooks/static-components -- référence stable du registre (ADR-TEMPLATE-REGISTRY) */}
                <Template cv={previewCv} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
