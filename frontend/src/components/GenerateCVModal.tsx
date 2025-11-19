'use client';

/**
 * GenerateCVModal - Phase 4.2
 * Modal pour déclencher la génération de CV par IA
 * 
 * UX Flow:
 * 1. Formulaire (Nom + Offre texte)
 * 2. Loading avec étapes progressives (30s-3min)
 * 3. Redirect vers éditeur ou gestion erreur 402
 */

import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { X, FileText, Sparkles, CheckCircle2, Upload } from 'lucide-react';
import Button from './ui/Button';
import { useToast } from './ui/Toast';
import { generateCV, type GenerateCVRequest } from '@/lib/api';
import { getErrorMessage } from '@/lib/api';

interface GenerateCVModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Étapes de génération avec timing
const GENERATION_STEPS = [
  { message: 'Analyse de l\'offre en cours...', delay: 0 },
  { message: 'Identification des compétences clés...', delay: 5000 },
  { message: 'Stratégie de mise en valeur du profil...', delay: 15000 },
  { message: 'Rédaction et optimisation du contenu...', delay: 30000 },
  { message: 'Finalisation du document...', delay: 45000 },
];

export default function GenerateCVModal({ isOpen, onClose }: GenerateCVModalProps) {
  const router = useRouter();
  const toast = useToast();
  
  const [cvName, setCvName] = useState('');
  const [offerText, setOfferText] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // Fonction de fermeture du modal
  const handleClose = useCallback(() => {
    if (isGenerating) return; // Ne pas fermer pendant génération
    setCvName('');
    setOfferText('');
    setCurrentStep(0);
    onClose();
  }, [isGenerating, onClose]);

  // Mutation pour générer le CV
  const generateMutation = useMutation({
    mutationFn: (data: GenerateCVRequest) => {
      setIsGenerating(true);
      setCurrentStep(0); // Reset au début
      return generateCV(data);
    },
    onSuccess: (response) => {
      setIsGenerating(false);
      toast.success('CV généré avec succès !');
      // Redirect vers l'éditeur
      router.push(`/cv/${response.cv_id}/edit`);
      handleClose();
    },
    onError: (error: unknown) => {
      setIsGenerating(false);
      // Erreur 402: Pas de CareerPass actif
      if ((error as { response?: { status?: number } }).response?.status === 402) {
        handleClose();
        toast.error('CareerPass requis pour générer des CVs');
        // TODO Phase 5: Ouvrir modal Stripe
        console.log('OPEN STRIPE MODAL - CareerPass required');
        return;
      }
      
      // Autres erreurs
      const errorMsg = getErrorMessage(error);
      toast.error(`Erreur: ${errorMsg}`);
    },
  });

  // Animation des étapes pendant le chargement
  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    
    GENERATION_STEPS.forEach((step, index) => {
      const timer = setTimeout(() => {
        setCurrentStep(index);
      }, step.delay);
      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [isGenerating]);

  // Empêcher le scroll quand modal ouverte
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Gestion Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isGenerating) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isGenerating, handleClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cvName.trim() || !offerText.trim()) {
      toast.warning('Veuillez remplir tous les champs');
      return;
    }

    generateMutation.mutate({
      cv_name: cvName.trim(),
      offer_text: offerText.trim(),
    });
  };

  const isFormValid = cvName.trim().length > 0 && offerText.trim().length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-60 backdrop-blur-sm"
        onClick={isGenerating ? undefined : handleClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Loading Screen */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col items-center justify-center p-8">
            <div className="mb-8">
              <Sparkles className="w-20 h-20 text-[#38A169] animate-pulse" />
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              Génération en cours...
            </h3>

            <div className="w-full max-w-md space-y-4">
              {GENERATION_STEPS.map((step, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    index <= currentStep ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  {index < currentStep ? (
                    <CheckCircle2 className="w-6 h-6 text-[#38A169] flex-shrink-0" />
                  ) : index === currentStep ? (
                    <div className="w-6 h-6 border-4 border-[#38A169] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 border-4 border-gray-300 rounded-full flex-shrink-0" />
                  )}
                  <p className={`text-lg ${index <= currentStep ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                    {step.message}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-gray-500 text-center max-w-md">
              Cette opération peut prendre de 30 secondes à 3 minutes.
              <br />
              Notre IA analyse l&apos;offre et optimise votre profil.
            </p>
          </div>
        )}

        {/* Form Screen */}
        {!isGenerating && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#38A169] bg-opacity-10 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-[#38A169]" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Générer un nouveau CV
                  </h2>
                  <p className="text-sm text-gray-500">
                    Optimisé par notre IA en quelques minutes
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Fermer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="space-y-6">
                {/* CV Name Input */}
                <div>
                  <label htmlFor="cv-name" className="block text-sm font-semibold text-gray-700 mb-2">
                    Nom du CV <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="cv-name"
                    type="text"
                    value={cvName}
                    onChange={(e) => setCvName(e.target.value)}
                    placeholder="Ex: CV - Développeur React - Google"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#38A169] focus:outline-none transition-colors text-gray-900"
                    maxLength={255}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {cvName.length}/255 caractères
                  </p>
                </div>

                {/* Offer Text Textarea */}
                <div>
                  <label htmlFor="offer-text" className="block text-sm font-semibold text-gray-700 mb-2">
                    Texte de l&apos;offre d&apos;emploi <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="offer-text"
                    value={offerText}
                    onChange={(e) => setOfferText(e.target.value)}
                    placeholder="Collez ici le texte complet de l'offre d'emploi (description du poste, compétences requises, responsabilités...)"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#38A169] focus:outline-none transition-colors resize-none text-gray-900"
                    rows={10}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Minimum 50 caractères · {offerText.length} caractères saisis
                  </p>
                </div>

                {/* PDF Upload (Disabled for V1) */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-gray-400">
                      Ou uploadez l&apos;offre en PDF
                    </label>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                      Bientôt disponible
                    </span>
                  </div>
                  <div className="relative opacity-50 cursor-not-allowed">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 mb-1">
                        Cliquez pour uploader ou glissez-déposez
                      </p>
                      <p className="text-xs text-gray-400">
                        PDF jusqu&apos;à 10MB (fonctionnalité à venir)
                      </p>
                    </div>
                    {/* Overlay to prevent clicks */}
                    <div className="absolute inset-0 cursor-not-allowed" />
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-900 mb-1">
                        Notre IA va analyser l&apos;offre
                      </h4>
                      <p className="text-sm text-blue-700">
                        Nous identifierons les compétences clés, analyserons vos expériences pertinentes,
                        et générerons un CV parfaitement adapté à cette opportunité.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </form>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                onClick={handleSubmit}
                disabled={!isFormValid}
                className={`flex items-center gap-2 ${
                  isFormValid
                    ? 'bg-[#38A169] hover:bg-[#2F855A] text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                Générer mon CV
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
