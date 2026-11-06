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
import Link from 'next/link';
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
  DEFAULT_CV_THEME_TOKENS,
  type GeneratedCVData,
} from '@talentious/cv-render';
import TemplateSelector from '@/components/cv/TemplateSelector';
import ThemeEditor from '@/components/cv/ThemeEditor';
import ThemeContrast from '@/components/cv/ThemeContrast';
import { useToast } from '@/components/ui/Toast';
import {
  getCV,
  updateCV,
  getCVTemplates,
  getErrorMessage,
  type CVTemplate,
  type CVThemeTokens,
  type DocumentLanguage,
} from '@/lib/api';
import { getExportErrorMessage } from '@/lib/exportErrors';
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

const THEME_TOKEN_KEYS: (keyof CVThemeTokens)[] = [
  'color_accent',
  'color_text',
  'color_muted',
  'color_background',
  'font_heading',
  'font_body',
];

// Égalité des 6 champs : dérive l'état « modifié » du thème (revenir à la
// valeur sauvée efface le drapeau, pas de faux positif).
const sameThemeTokens = (a: CVThemeTokens, b: CVThemeTokens): boolean =>
  THEME_TOKEN_KEYS.every((k) => a[k] === b[k]);

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
  // Catalogue de l'enveloppe : alimente le sélecteur (gratuits + premium).
  const [templates, setTemplates] = useState<CVTemplate[]>([]);
  // Template dont la sélection s'enregistre (PUT en vol) : désactive l'option.
  const [templateBusyId, setTemplateBusyId] = useState<string | null>(null);
  // Enveloppe thème (M3-T11) : tokens édités en direct + provenance (id/name)
  // pour le round-trip. Save BUFFERISÉ (bouton dédié), pas un PUT par frappe.
  const [themeTokens, setThemeTokens] = useState<CVThemeTokens>(
    DEFAULT_CV_THEME_TOKENS,
  );
  const [themeId, setThemeId] = useState<string | null>('anthracite');
  const [themeName, setThemeName] = useState<string>('Anthracite');
  // Langue de RENDU de l'enveloppe (M3-T14) : non éditée ici, mais appliquée à
  // l'aperçu live pour tenir « aperçu = PDF » (libellés de section, mois).
  const [language, setLanguage] = useState<DocumentLanguage>('fr');
  // Derniers tokens PERSISTÉS : référence de l'état « modifié » dérivé.
  const [savedThemeTokens, setSavedThemeTokens] =
    useState<CVThemeTokens>(DEFAULT_CV_THEME_TOKENS);
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Lecture seule (D1, M3-T12) : un document créé sous Pass sans Pass actif
  // se consulte et se télécharge, mais ne s'édite plus. Serveur autoritatif.
  const [isEditable, setIsEditable] = useState(true);

  // « Modifié » DÉRIVÉ : vrai tant que les tokens édités diffèrent des
  // derniers persistés. Revenir à la valeur sauvée efface l'état.
  const isThemeDirty = !sameThemeTokens(themeTokens, savedThemeTokens);
  const readOnly = !isEditable;

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
        // Enveloppe thème (requise au contrat) : aligne l'édition ET la
        // référence « persistée » sur ce que le serveur renvoie.
        setThemeTokens(detail.theme.tokens);
        setSavedThemeTokens(detail.theme.tokens);
        setThemeId(detail.theme.id ?? null);
        setThemeName(detail.theme.name);
        // Repli défensif (même motif que is_editable) : un champ absent n'écrase
        // pas le 'fr' initial par undefined.
        setLanguage(detail.language ?? 'fr');
        // Défaut éditable si le champ manque : le serveur gate de toute façon.
        setIsEditable(detail.is_editable ?? true);
      })
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err)))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cvId]);

  // Catalogue des Templates : chargé une fois pour le sélecteur. Dégradation
  // silencieuse si indisponible — l'édition du contenu n'en dépend pas, le
  // sélecteur reste simplement masqué.
  useEffect(() => {
    let cancelled = false;
    getCVTemplates()
      .then((list) => !cancelled && setTemplates(list))
      .catch((err) => {
        // Dégradation voulue : sélecteur masqué, l'édition du contenu continue.
        console.error('Catalogue des templates indisponible:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Warn before leaving with unsaved changes (tab close / reload).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty || isThemeDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, isThemeDirty]);

  // State helpers — every mutation marks the CV dirty.
  const mutate = useCallback(
    (updater: (prev: GeneratedCVData) => GeneratedCVData) => {
      if (readOnly) return;
      setCv(updater);
      setIsDirty(true);
    },
    [readOnly],
  );

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
    if (readOnly) return;
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
      const updated = await updateCV(
        cvId,
        {
          cv_name: cvName.trim() || 'CV sans nom',
          cv_data_json: sanitizeCVForSave(cv),
        },
        { skipBillingRedirect: true },
      );
      // Resynchronise l'éditeur sur ce qui est RÉELLEMENT stocké : toute entrée
      // écartée ou tronquée par la coercition backend devient visible
      // immédiatement, pas au rechargement.
      setCv(ensureCVShape(updated.cv_data_json));
      setCvName(updated.cv_name);
      setIsDirty(false);
      toast.success('CV enregistré.');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 402) {
        // Document verrouillé (Pass expiré en cours de session) : bascule en
        // lecture seule et motif typé, sans redirection dure (le contenu non
        // sauvé reste à l'écran, l'utilisateur ne perd rien).
        setIsEditable(false);
        toast.error(
          getExportErrorMessage(
            err,
            'Ce document nécessite un Pass actif pour être modifié.',
          ),
        );
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Sélection d'un Template : persiste l'ENVELOPPE seule (PUT partiel), sans
  // toucher au contenu ni à l'état « modifié ». On ne bascule l'aperçu qu'après
  // confirmation du serveur (une sélection premium refusée ne change rien).
  const handleSelectTemplate = async (nextId: string) => {
    if (!cvId || nextId === templateId || templateBusyId) return;
    setTemplateBusyId(nextId);
    try {
      await updateCV(
        cvId,
        { template_id: nextId },
        { skipBillingRedirect: true },
      );
      setTemplateId(nextId);
      toast.success('Modèle appliqué.');
    } catch (err) {
      // 402 premium : NON redirigé (skipBillingRedirect), le motif typé
      // s'affiche ici en place (sans pression). Couvre aussi réseau/5xx.
      toast.error(
        getExportErrorMessage(
          err,
          "Impossible d'appliquer ce modèle. Réessaie dans un instant.",
        ),
      );
    } finally {
      setTemplateBusyId(null);
    }
  };

  const handleThemeChange = (next: CVThemeTokens) => {
    // L'état « modifié » est dérivé (comparaison aux tokens persistés).
    setThemeTokens(next);
  };

  // Sauvegarde du THÈME : PUT d'enveloppe SEUL ({ theme }), jamais le contenu
  // (M1-T14 : contenu et enveloppe indépendants). Le serveur tranche preset vs
  // personnalisé en comparant les tokens et gate le premium (402).
  const handleSaveTheme = async () => {
    if (!cvId || !isThemeDirty) return;
    setIsThemeSaving(true);
    try {
      const updated = await updateCV(
        cvId,
        { theme: { id: themeId, name: themeName, tokens: themeTokens } },
        { skipBillingRedirect: true },
      );
      // Resync AUTORITATIF sur ce que le serveur a stocké (custom => id null
      // / nom « Personnalisé » ; preset reconnu => sa provenance). La
      // référence persistée suit, ce qui remet l'état « modifié » à faux.
      setThemeTokens(updated.theme.tokens);
      setSavedThemeTokens(updated.theme.tokens);
      setThemeId(updated.theme.id ?? null);
      setThemeName(updated.theme.name);
      toast.success('Thème enregistré.');
    } catch (err) {
      // 402 premium-theme-required : NON redirigé (skipBillingRedirect), le
      // motif typé s'affiche en place sans pression. Repli NEUTRE (réseau/5xx/
      // 422) ; les couleurs invalides sont déjà bloquées par l'éditeur.
      toast.error(
        getExportErrorMessage(
          err,
          "Impossible d'enregistrer le thème. Réessaie dans un instant.",
        ),
      );
    } finally {
      setIsThemeSaving(false);
    }
  };

  // L'aperçu rend EXACTEMENT le payload du save (aperçu = PDF). Mémoïsé pour ne
  // pas recréer l'objet (et re-déclencher la mesure du renderer) inutilement.
  const previewCv = useMemo(() => sanitizeCVForSave(cv), [cv]);
  const Template = getTemplate(templateId);

  const hardSkills = useMemo(() => skillNames(cv.highlighted_skills, 'hard_skill'), [cv]);
  const softSkills = useMemo(() => skillNames(cv.highlighted_skills, 'soft_skill'), [cv]);

  const confirmLeave = () =>
    (!isDirty && !isThemeDirty) ||
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
            disabled={readOnly}
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
            disabled={readOnly || !isDirty || isSaving}
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-2">
        {/* Editing pane */}
        <div className="space-y-4">
          {readOnly && (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <p className="font-medium">Ce CV est en lecture seule.</p>
              <p className="mt-1">
                Il a été créé avec un Pass. Pour le modifier à nouveau, il te
                faut un Pass actif. Tu peux toujours le consulter et le
                télécharger en PDF.
              </p>
              <Link
                href="/billing"
                className="mt-2 inline-block font-medium underline"
              >
                Voir les Pass
              </Link>
            </div>
          )}
          <fieldset
            disabled={readOnly}
            className="m-0 min-w-0 space-y-4 border-0 p-0"
          >
          {templates.length > 0 && (
            <ProfileSection
              title="Modèle de CV"
              description="Choisis la mise en page. L'aperçu se met à jour aussitôt."
              defaultOpen
              isComplete
            >
              <TemplateSelector
                templates={templates}
                selectedId={templateId}
                cv={previewCv}
                onSelect={handleSelectTemplate}
                busyId={templateBusyId}
              />
            </ProfileSection>
          )}
          <ProfileSection
            title="Thème"
            description="Couleurs et polices du CV. L'aperçu se met à jour en direct."
            defaultOpen
            isComplete
          >
            <div className="space-y-5">
              <ThemeEditor
                tokens={themeTokens}
                onChange={handleThemeChange}
                disabled={isThemeSaving}
              />
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-text-secondary">
                  Contraste (lisibilité)
                </p>
                <ThemeContrast tokens={themeTokens} />
              </div>
              <div className="flex items-center justify-end gap-3">
                {isThemeDirty && (
                  <span className="text-xs text-text-secondary">
                    Thème modifié
                  </span>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveTheme}
                  isLoading={isThemeSaving}
                  disabled={!isThemeDirty || isThemeSaving}
                >
                  Enregistrer le thème
                </Button>
              </div>
            </div>
          </ProfileSection>
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
            defaultOpen={readOnly}
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

          <ProfileSection
            title="Formation"
            defaultOpen={readOnly}
            isComplete={cv.selected_educations.length > 0}
          >
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
            defaultOpen={readOnly}
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

          <ProfileSection
            title="Projets"
            defaultOpen={readOnly}
            isComplete={cv.selected_projects.length > 0}
          >
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
            defaultOpen={readOnly}
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
          </fieldset>
        </div>

        {/* Live preview pane */}
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <p className="mb-3 text-sm font-medium text-text-secondary">Aperçu en direct</p>
            <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              <div style={{ zoom: 0.62 }}>
                {/* Aperçu live = état EN COURS d'édition : entrée nettoyée
                    (sanitizeCVForSave) + thème/langue en état local, PAS
                    l'enveloppe persistée. La page print (?preview=1) reste le
                    miroir fidèle de l'export ; ici la sanitisation contrôles/bidi
                    du serveur n'est pas rejouée (écart cosmétique connu). */}
                {/* eslint-disable-next-line react-hooks/static-components -- référence stable du registre (ADR-TEMPLATE-REGISTRY) */}
                <Template
                  cv={previewCv}
                  theme={themeTokens}
                  language={language}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
