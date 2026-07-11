'use client';

/**
 * EducationForm Component - Talentious
 * Single education item in the profile
 */

import { Education } from '@/types/profile';
import Input from '@/components/ui/Input';
import RemoveBlockButton from '@/components/profile/RemoveBlockButton';

interface EducationFormProps {
  education: Education;
  onChange: (field: string, value: unknown) => void;
  onRemove: () => void;
}

export default function EducationForm({
  education,
  onChange,
  onRemove,
}: EducationFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      {/* Header with Remove Button */}
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-text-primary">
          {education.degree || 'Nouvelle formation'}
        </h4>
        <RemoveBlockButton onRemove={onRemove} label="cette formation" />
      </div>

      {/* Form Fields */}
      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="Diplôme *"
          value={education.degree}
          onChange={(e) => onChange('degree', e.target.value)}
          placeholder="Master en Informatique"
        />
        <Input
          label="Institution *"
          value={education.institution}
          onChange={(e) => onChange('institution', e.target.value)}
          placeholder="Université de Paris"
        />
        <Input
          label="Domaine d'études"
          value={education.field || ''}
          onChange={(e) => onChange('field', e.target.value)}
          placeholder="Science des données"
        />
        <Input
          label="Localisation"
          value={education.location || ''}
          onChange={(e) => onChange('location', e.target.value)}
          placeholder="Paris, France"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Début *"
            type="month"
            value={education.start_date || ''}
            onChange={(e) => onChange('start_date', e.target.value)}
          />
          <Input
            label="Fin"
            type="month"
            value={education.end_date || ''}
            onChange={(e) => onChange('end_date', e.target.value)}
          />
        </div>
        <Input
          label="Mention / Note"
          value={education.grade || ''}
          onChange={(e) => onChange('grade', e.target.value)}
          placeholder="Mention Très Bien"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Description (optionnel)
        </label>
        <textarea
          value={education.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Cours principaux, projets, distinctions..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}
