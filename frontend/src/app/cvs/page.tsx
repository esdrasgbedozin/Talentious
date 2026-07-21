'use client';

/**
 * Dashboard Page - Mes CVs
 * Phase 4.1: Display user's generated CVs with CRUD actions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import GenerateCVModal from '@/components/GenerateCVModal';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
import { useToast } from '@/components/ui/Toast';
import { getCVs, deleteCV, type CVBase } from '@/lib/api';
import { useState } from 'react';
import { FileText, Edit, Download, Trash2, Plus } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  // Fetch CVs with TanStack Query
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cvs'],
    queryFn: getCVs,
  });

  // Delete CV mutation
  const deleteMutation = useMutation({
    mutationFn: deleteCV,
    onSuccess: () => {
      // Invalidate and refetch CVs list
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      setDeletingId(null);
      setConfirmDelete(null);
      toast.success('CV supprimé avec succès');
    },
    onError: (error) => {
      console.error('Failed to delete CV:', error);
      setDeletingId(null);
      setConfirmDelete(null);
      toast.error('Erreur lors de la suppression du CV');
    },
  });

  const handleDelete = (cvId: string, cvName: string) => {
    setConfirmDelete({ id: cvId, name: cvName });
  };

  const confirmDeleteAction = () => {
    if (confirmDelete) {
      setDeletingId(confirmDelete.id);
      deleteMutation.mutate(confirmDelete.id);
    }
  };

  const handleEdit = (cvId: string) => {
    router.push(`/cv/${cvId}/edit`);
  };

  const handleDownload = (cvId: string) => {
    // Opens the print route, which renders the CV full-size and triggers the
    // browser's print dialog (Save as PDF).
    router.push(`/cv/${cvId}/print`);
  };

  const handleGenerateNew = () => {
    setIsGenerateModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar variant="authenticated" />
      <EmailVerificationBanner />

      {/* Generate CV Modal */}
      <GenerateCVModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title="Supprimer ce CV ?"
        message={`Êtes-vous sûr de vouloir supprimer "${confirmDelete?.name}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={confirmDeleteAction}
        onCancel={() => setConfirmDelete(null)}
      />

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold text-text-primary sm:text-4xl">Mes CVs</h1>
          <Button
            variant="primary"
            size="lg"
            onClick={handleGenerateNew}
            className="flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Générer un nouveau CV
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 border-4 border-action border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-text-secondary text-lg">Chargement de vos CVs...</p>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="text-center py-20">
            <div className="text-red-600 mb-4">
              <FileText size={64} className="mx-auto opacity-50" />
            </div>
            <h2 className="text-2xl font-semibold text-text-primary mb-2">
              Erreur de chargement
            </h2>
            <p className="text-text-secondary mb-6">
              {error instanceof Error ? error.message : 'Une erreur est survenue'}
            </p>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['cvs'] })}
            >
              Réessayer
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && data && data.length === 0 && (
          <div className="text-center py-20">
            <div className="mb-8">
              <FileText size={120} className="mx-auto text-gray-300" />
            </div>
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Aucun CV pour le moment
            </h2>
            <p className="text-text-secondary mb-8 max-w-md mx-auto">
              Commencez par générer votre premier CV professionnel optimisé par notre IA.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={handleGenerateNew}
              className="flex items-center gap-2 mx-auto"
            >
              <Plus size={20} />
              Générer mon premier CV
            </Button>
          </div>
        )}

        {/* CVs Grid */}
        {!isLoading && !isError && data && data.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.map((cv) => (
              <CVCard
                key={cv.id}
                cv={cv}
                onEdit={handleEdit}
                onDownload={handleDownload}
                onDelete={handleDelete}
                isDeleting={deletingId === cv.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ===== CV Card Component =====

interface CVCardProps {
  cv: CVBase;
  onEdit: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  isDeleting: boolean;
}

function CVCard({ cv, onEdit, onDownload, onDelete, isDeleting }: CVCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-xl transition-all duration-300 hover:border-action group">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-12 h-12 bg-action/10 rounded-lg flex items-center justify-center group-hover:bg-action/20 transition-colors">
          <FileText size={24} className="text-action" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary text-lg truncate mb-1">
            {cv.cv_name}
          </h3>
          <p className="text-sm text-text-secondary">
            Modifié le {formatDate(cv.updated_at)}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(cv.id)}
          className="flex-1 flex items-center justify-center gap-2"
        >
          <Edit size={16} />
          Éditer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDownload(cv.id)}
          className="flex items-center justify-center p-2"
          title="Télécharger en PDF"
        >
          <Download size={18} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(cv.id, cv.cv_name)}
          disabled={isDeleting}
          className="flex items-center justify-center p-2 text-red-600 hover:text-red-700 hover:bg-red-50"
          title="Supprimer"
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 size={18} />
          )}
        </Button>
      </div>
    </div>
  );
}
