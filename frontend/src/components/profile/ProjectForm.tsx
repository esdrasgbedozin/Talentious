'use client';

import { Project } from '@/types/profile';
import Input from '@/components/ui/Input';

interface ProjectFormProps {
  project: Project;
  onChange: (field: string, value: unknown) => void;
  onRemove: () => void;
}

export default function ProjectForm({ project, onChange, onRemove }: ProjectFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-gray-900">{project.name || 'Nouveau projet'}</h4>
        <button onClick={onRemove} className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors" aria-label="Supprimer ce projet">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Nom du projet *" value={project.name} onChange={(e) => onChange('name', e.target.value)} placeholder="Plateforme e-commerce" />
        <Input label="Rôle" value={project.role || ''} onChange={(e) => onChange('role', e.target.value)} placeholder="Lead Developer" />
        <Input label="URL" value={project.url || ''} onChange={(e) => onChange('url', e.target.value)} placeholder="https://..." />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Début" type="month" value={project.start_date || ''} onChange={(e) => onChange('start_date', e.target.value)} />
          <Input label="Fin" type="month" value={project.end_date || ''} onChange={(e) => onChange('end_date', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
        <textarea value={project.description} onChange={(e) => onChange('description', e.target.value)} placeholder="Décrivez le projet..." rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent resize-none" />
      </div>
    </div>
  );
}
