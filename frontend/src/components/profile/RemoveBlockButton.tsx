'use client';

/**
 * RemoveBlockButton — trash button that asks for confirmation before removing a
 * consequential block (experience, education, project, certification). Keeps the
 * one-click destructive action from wiping a whole block by accident, even though
 * changes aren't persisted until the user saves.
 */
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface RemoveBlockButtonProps {
  onRemove: () => void;
  /** What is being removed, e.g. "cette expérience". Used in the aria-label + message. */
  label: string;
}

export default function RemoveBlockButton({ onRemove, label }: RemoveBlockButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
        aria-label={`Supprimer ${label}`}
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Supprimer ce bloc ?"
        message={`Voulez-vous vraiment supprimer ${label} ? Cette section sera retirée du profil ; pensez à enregistrer pour valider.`}
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={() => {
          onRemove();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
