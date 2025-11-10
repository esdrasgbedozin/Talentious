'use client';

/**
 * Onboarding Page - Talentious
 * Premier écran après inscription - Import du profil utilisateur
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';

export default function OnboardingPage() {
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState<'cv' | 'linkedin' | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  // Validate file (PDF only, max 10MB)
  const validateAndSetFile = (file: File) => {
    setError(null);

    if (file.type !== 'application/pdf') {
      setError('Seuls les fichiers PDF sont acceptés.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('La taille du fichier ne doit pas dépasser 10 MB.');
      return;
    }

    setUploadedFile(file);
  };

  // Handle drag & drop
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  // Handle upload and parsing
  const handleContinue = async () => {
    if (!uploadedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      // TODO: Phase 3 - Appeler l'API de parsing
      // const formData = new FormData();
      // formData.append('file', uploadedFile);
      // const response = await apiClient.post('/profile/parse-cv', formData);
      
      // Pour l'instant, simuler un délai et rediriger
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      router.push('/profile');
    } catch {
      setError('Une erreur est survenue lors du traitement du fichier. Veuillez réessayer.');
      setIsUploading(false);
    }
  };

  // Skip to manual profile creation
  const handleManualStart = () => {
    router.push('/profile');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar variant="authenticated" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Bienvenue sur Talentious
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Importons votre profil pour commencer. Choisissez la méthode qui vous convient le mieux.
          </p>
        </div>

        {/* Options Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Option 1: Import CV */}
          <button
            onClick={() => setSelectedOption('cv')}
            className={`relative group bg-white rounded-2xl p-8 border-2 transition-all duration-300 hover:shadow-xl ${
              selectedOption === 'cv'
                ? 'border-[#38A169] shadow-lg scale-105'
                : 'border-gray-200 hover:border-[#38A169]'
            }`}
          >
            {/* Badge "Recommandé" */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#38A169] to-[#2F855A] text-white text-xs font-semibold px-4 py-1 rounded-full shadow-md">
              Recommandé
            </div>

            <div className="flex flex-col items-center text-center">
              {/* Icon */}
              <div className="w-16 h-16 bg-gradient-to-br from-[#38A169] to-[#2F855A] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Importer un CV (PDF)
              </h3>
              <p className="text-sm text-gray-600">
                La méthode la plus rapide pour pré-remplir votre profil
              </p>
            </div>
          </button>

          {/* Option 2: Import LinkedIn */}
          <button
            onClick={() => setSelectedOption('linkedin')}
            className={`relative group bg-white rounded-2xl p-8 border-2 transition-all duration-300 hover:shadow-xl ${
              selectedOption === 'linkedin'
                ? 'border-[#38A169] shadow-lg scale-105'
                : 'border-gray-200 hover:border-[#38A169]'
            }`}
          >
            <div className="flex flex-col items-center text-center">
              {/* Icon */}
              <div className="w-16 h-16 bg-gradient-to-br from-[#0A66C2] to-[#004182] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Profil LinkedIn (PDF)
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                Exportez votre profil LinkedIn en PDF
              </p>
              
              {/* Info tooltip */}
              <div className="group/tooltip relative inline-block">
                <span className="text-xs text-[#38A169] hover:text-[#2F855A] font-medium flex items-center gap-1 cursor-help">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Comment faire ?
                </span>
                <div className="invisible group-hover/tooltip:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-10">
                  <p className="mb-2 font-semibold">Exporter votre profil LinkedIn :</p>
                  <ol className="list-decimal list-inside space-y-1 text-left">
                    <li>Ouvrez votre profil LinkedIn</li>
                    <li>Cliquez sur &quot;Plus&quot;</li>
                    <li>Sélectionnez &quot;Enregistrer en PDF&quot;</li>
                  </ol>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                </div>
              </div>
            </div>
          </button>

          {/* Option 3: Manual */}
          <button
            onClick={handleManualStart}
            className="group bg-white rounded-2xl p-8 border-2 border-gray-200 transition-all duration-300 hover:shadow-lg hover:border-gray-300"
          >
            <div className="flex flex-col items-center text-center">
              {/* Icon */}
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-gray-200 transition-colors">
                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Commencer manuellement
              </h3>
              <p className="text-sm text-gray-600">
                Remplir votre profil à la main
              </p>
            </div>
          </button>
        </div>

        {/* Upload Area - Only visible when CV or LinkedIn is selected */}
        {(selectedOption === 'cv' || selectedOption === 'linkedin') && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {selectedOption === 'cv' ? 'Importez votre CV' : 'Importez votre profil LinkedIn'}
            </h2>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                isDragging
                  ? 'border-[#38A169] bg-green-50'
                  : uploadedFile
                  ? 'border-[#38A169] bg-green-50/30'
                  : 'border-gray-300 hover:border-[#38A169] hover:bg-gray-50'
              }`}
            >
              <input
                type="file"
                id="file-upload"
                accept=".pdf"
                onChange={handleFileChange}
                className="sr-only"
              />

              {uploadedFile ? (
                // File preview
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-[#38A169] to-[#2F855A] rounded-2xl flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{uploadedFile.name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Supprimer
                  </button>
                </div>
              ) : (
                // Upload prompt
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-lg text-gray-700 mb-2">
                      Glissez-déposez votre fichier PDF ici
                    </p>
                    <p className="text-sm text-gray-500 mb-4">ou</p>
                    <label htmlFor="file-upload">
                      <span className="inline-block bg-gradient-to-r from-[#38A169] to-[#2F855A] text-white px-6 py-3 rounded-lg font-medium cursor-pointer hover:shadow-lg transition-shadow">
                        Parcourir les fichiers
                      </span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    Format PDF uniquement • Taille maximale : 10 MB
                  </p>
                </div>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Continue button */}
            <div className="mt-8 flex justify-end">
              <Button
                variant="primary"
                size="lg"
                onClick={handleContinue}
                disabled={!uploadedFile || isUploading}
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyse en cours...
                  </span>
                ) : (
                  'Continuer'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Help text */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Vos données sont sécurisées et ne seront jamais partagées sans votre consentement.
          </p>
        </div>
      </main>
    </div>
  );
}
