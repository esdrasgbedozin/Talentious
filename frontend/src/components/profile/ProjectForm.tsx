'use client';

import { Project } from '@/types/profile';
import Input from '@/components/ui/Input';
import RemoveBlockButton from '@/components/profile/RemoveBlockButton';

interface ProjectFormProps {
  project: Project;
  onChange: (field: string, value: unknown) => void;
  onRemove: () => void;
}

export default function ProjectForm({ project, onChange, onRemove }: ProjectFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-text-primary">{project.name || 'Nouveau projet'}</h4>
        <RemoveBlockButton onRemove={onRemove} label="ce projet" />
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
        <label className="block text-sm font-medium text-text-primary mb-2">Description *</label>
        <textarea value={project.description} onChange={(e) => onChange('description', e.target.value)} placeholder="Décrivez le projet..." rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent resize-none" />
      </div>
    </div>
  );
}
