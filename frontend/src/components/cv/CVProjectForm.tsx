'use client';

/**
 * CVProjectForm — Talentious (M0-T08c)
 * Un projet du CV édité, au schéma CANONIQUE `SelectedProject` :
 * `completion_date` (pas de start/role) et `relevant_skills`.
 */

import type { components } from '@/generated/api';
import Input from '@/components/ui/Input';
import SkillsInput from '@/components/profile/SkillsInput';
import RemoveBlockButton from '@/components/profile/RemoveBlockButton';
import { CV_SAVE_MAX_LIST_ITEMS } from '@/lib/cvEditor';

type SelectedProject = components['schemas']['SelectedProject'];

interface CVProjectFormProps {
  project: SelectedProject;
  onChange: (field: keyof SelectedProject, value: unknown) => void;
  onRemove: () => void;
}

export default function CVProjectForm({ project, onChange, onRemove }: CVProjectFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-text-primary">
          {project.name || 'Nouveau projet'}
        </h4>
        <RemoveBlockButton onRemove={onRemove} label="ce projet" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="Nom du projet *"
          value={project.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="Application de covoiturage"
        />
        <Input
          label="URL"
          value={project.url || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://github.com/…"
        />
        <Input
          label="Date de fin"
          type="month" placeholder="AAAA-MM"
          value={project.completion_date || ''}
          onChange={(e) => onChange('completion_date', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Description *
        </label>
        <textarea
          value={project.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Objectif du projet, votre contribution, résultats…"
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent resize-none"
        />
      </div>

      <SkillsInput
        label="Compétences / technologies"
        skills={project.relevant_skills}
        onChange={(skills) => onChange('relevant_skills', skills)}
        maxSkills={CV_SAVE_MAX_LIST_ITEMS}
      />
    </div>
  );
}
