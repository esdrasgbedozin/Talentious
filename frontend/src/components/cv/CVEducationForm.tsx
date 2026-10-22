'use client';

/**
 * CVEducationForm — Talentious (M0-T08c)
 * Une formation du CV édité, au schéma CANONIQUE `SelectedEducation` :
 * uniquement les champs modélisés (degree, institution, end_date, description).
 */

import type { components } from '@/generated/api';
import Input from '@/components/ui/Input';
import RemoveBlockButton from '@/components/profile/RemoveBlockButton';

type SelectedEducation = components['schemas']['SelectedEducation'];

interface CVEducationFormProps {
  education: SelectedEducation;
  onChange: (field: keyof SelectedEducation, value: unknown) => void;
  onRemove: () => void;
}

export default function CVEducationForm({
  education,
  onChange,
  onRemove,
}: CVEducationFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-text-primary">
          {education.degree || 'Nouvelle formation'}
        </h4>
        <RemoveBlockButton onRemove={onRemove} label="cette formation" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="Diplôme *"
          value={education.degree}
          onChange={(e) => onChange('degree', e.target.value)}
          placeholder="Master en Informatique"
        />
        <Input
          label="Établissement *"
          value={education.institution}
          onChange={(e) => onChange('institution', e.target.value)}
          placeholder="Université Paris-Saclay"
        />
        <Input
          label="Date d'obtention"
          type="month" placeholder="AAAA-MM"
          value={education.end_date || ''}
          onChange={(e) => onChange('end_date', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Description
        </label>
        <textarea
          value={education.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Spécialisation, mention, projets marquants…"
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}
