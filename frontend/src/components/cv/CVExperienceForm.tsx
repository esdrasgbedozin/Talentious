'use client';

/**
 * CVExperienceForm — Talentious (M0-T08c)
 * Une expérience du CV édité, au schéma CANONIQUE `SelectedExperience` :
 * pas de `is_current` (poste actuel = `end_date` null), compétences par
 * expérience éditables (elles survivent au cycle éditeur).
 */

import type { components } from '@/generated/api';
import Input from '@/components/ui/Input';
import SkillsInput from '@/components/profile/SkillsInput';
import RemoveBlockButton from '@/components/profile/RemoveBlockButton';
import { CV_SAVE_MAX_LIST_ITEMS } from '@/lib/cvEditor';

type SelectedExperience = components['schemas']['SelectedExperience'];

interface CVExperienceFormProps {
  experience: SelectedExperience;
  onChange: (field: keyof SelectedExperience, value: unknown) => void;
  onRemove: () => void;
}

export default function CVExperienceForm({
  experience,
  onChange,
  onRemove,
}: CVExperienceFormProps) {
  const isCurrent = experience.end_date === null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-text-primary">
          {experience.title || 'Nouvelle expérience'}
        </h4>
        <RemoveBlockButton onRemove={onRemove} label="cette expérience" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="Poste *"
          value={experience.title}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="Développeur Full Stack"
        />
        <Input
          label="Entreprise *"
          value={experience.company}
          onChange={(e) => onChange('company', e.target.value)}
          placeholder="Tech Corp"
        />
        <Input
          label="Localisation"
          value={experience.location || ''}
          onChange={(e) => onChange('location', e.target.value)}
          placeholder="Paris, France"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Début *"
            type="month" placeholder="AAAA-MM"
            value={experience.start_date}
            onChange={(e) => onChange('start_date', e.target.value)}
          />
          <Input
            label="Fin"
            type="month" placeholder="AAAA-MM"
            value={experience.end_date || ''}
            onChange={(e) => onChange('end_date', e.target.value)}
            disabled={isCurrent}
          />
        </div>
      </div>

      {/* Poste actuel = end_date null (schéma canonique) ; décoché sans date,
          le save est bloqué avec un message explicite (validateCVForSave). */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isCurrent}
          onChange={(e) => onChange('end_date', e.target.checked ? null : '')}
          className="w-4 h-4 text-action border-gray-300 rounded focus:ring-action"
        />
        <span className="text-sm text-text-primary">Poste actuel</span>
      </label>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Description *
        </label>
        <textarea
          value={experience.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Décrivez vos responsabilités et réalisations..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent resize-none"
        />
      </div>

      <SkillsInput
        label="Compétences mises en avant pour cette expérience"
        skills={experience.highlighted_skills}
        onChange={(skills) => onChange('highlighted_skills', skills)}
        maxSkills={CV_SAVE_MAX_LIST_ITEMS}
      />
    </div>
  );
}
