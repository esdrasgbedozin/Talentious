'use client';

import { Certification } from '@/types/profile';
import Input from '@/components/ui/Input';
import RemoveBlockButton from '@/components/profile/RemoveBlockButton';

interface CertificationFormProps {
  certification: Certification;
  onChange: (field: string, value: unknown) => void;
  onRemove: () => void;
}

export default function CertificationForm({ certification, onChange, onRemove }: CertificationFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-text-primary">{certification.name || 'Nouvelle certification'}</h4>
        <RemoveBlockButton onRemove={onRemove} label="cette certification" />
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
