'use client';

import { Certification } from '@/types/profile';
import Input from '@/components/ui/Input';

interface CertificationFormProps {
  certification: Certification;
  onChange: (field: string, value: unknown) => void;
  onRemove: () => void;
}

export default function CertificationForm({ certification, onChange, onRemove }: CertificationFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-gray-900">{certification.name || 'Nouvelle certification'}</h4>
        <button onClick={onRemove} className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors" aria-label="Supprimer cette certification">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Input label="Nom de la certification *" value={certification.name} onChange={(e) => onChange('name', e.target.value)} placeholder="AWS Certified Solutions Architect" />
        <Input label="Organisation émettrice *" value={certification.issuer} onChange={(e) => onChange('issuer', e.target.value)} placeholder="Amazon Web Services" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date d'obtention" type="month" value={certification.issue_date || ''} onChange={(e) => onChange('issue_date', e.target.value)} />
          <Input label="Date d'expiration" type="month" value={certification.expiration_date || ''} onChange={(e) => onChange('expiration_date', e.target.value)} />
        </div>
        <Input label="ID de certification" value={certification.credential_id || ''} onChange={(e) => onChange('credential_id', e.target.value)} placeholder="AWS-123456789" />
        <Input label="URL de vérification" value={certification.credential_url || ''} onChange={(e) => onChange('credential_url', e.target.value)} placeholder="https://..." className="md:col-span-2" />
      </div>
    </div>
  );
}
