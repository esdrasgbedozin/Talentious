'use client';

/**
 * CVCertificationForm — Talentious (M0-T08c)
 * Une certification du CV édité, au schéma CANONIQUE `SelectedCertification` :
 * uniquement name, issuer, issue_date, url.
 */

import type { components } from '@/generated/api';
import Input from '@/components/ui/Input';
import RemoveBlockButton from '@/components/profile/RemoveBlockButton';

type SelectedCertification = components['schemas']['SelectedCertification'];

interface CVCertificationFormProps {
  certification: SelectedCertification;
  onChange: (field: keyof SelectedCertification, value: unknown) => void;
  onRemove: () => void;
}

export default function CVCertificationForm({
  certification,
  onChange,
  onRemove,
}: CVCertificationFormProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-lg font-semibold text-text-primary">
          {certification.name || 'Nouvelle certification'}
        </h4>
        <RemoveBlockButton onRemove={onRemove} label="cette certification" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="Nom *"
          value={certification.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="AWS Solutions Architect"
        />
        <Input
          label="Organisme *"
          value={certification.issuer}
          onChange={(e) => onChange('issuer', e.target.value)}
          placeholder="Amazon Web Services"
        />
        <Input
          label="Date d'obtention"
          type="month" placeholder="AAAA-MM"
          value={certification.issue_date || ''}
          onChange={(e) => onChange('issue_date', e.target.value)}
        />
        <Input
          label="URL du certificat"
          value={certification.url || ''}
          onChange={(e) => onChange('url', e.target.value)}
          placeholder="https://credential.net/…"
        />
      </div>
    </div>
  );
}
