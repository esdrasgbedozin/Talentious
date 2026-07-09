'use client';

/**
 * ExperienceForm Component - Talentious
 * Single experience item in the profile
 */

import { Experience } from '@/types/profile';
import Input from '@/components/ui/Input';

interface ExperienceFormProps {
  experience: Experience;
  onChange: (field: string, value: unknown) => void;
  onRemove: () => void;
}

export default function ExperienceForm({
  experience,
  onChange,
  onRemove,
}: ExperienceFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      {/* Header with Remove Button */}
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-gray-900">
          {experience.title || 'Nouvelle expérience'}
        </h4>
        <button
          onClick={onRemove}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
          aria-label="Supprimer cette expérience"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Form Fields */}
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
            type="month"
            value={experience.start_date}
            onChange={(e) => onChange('start_date', e.target.value)}
          />
          <Input
            label="Fin"
            type="month"
            value={experience.end_date || ''}
            onChange={(e) => onChange('end_date', e.target.value)}
            disabled={experience.is_current}
          />
        </div>
      </div>

      {/* Current Position Checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={experience.is_current}
          onChange={(e) => {
            onChange('is_current', e.target.checked);
            if (e.target.checked) {
              onChange('end_date', '');
            }
          }}
          className="w-4 h-4 text-action border-gray-300 rounded focus:ring-action"
        />
        <span className="text-sm text-gray-700">Poste actuel</span>
      </label>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
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
    </div>
  );
}
