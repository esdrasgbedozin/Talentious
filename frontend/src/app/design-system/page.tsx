'use client';

import React, { useState } from 'react';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Modal, ModalFooter } from '@/components/ui';

export default function DesignSystemDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    if (value && value.length < 3) {
      setInputError('Le texte doit contenir au moins 3 caractères');
    } else {
      setInputError('');
    }
  };

  return (
    <div className="min-h-screen bg-background-light py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary mb-2">
            Talentious Design System
          </h1>
          <p className="text-text-secondary">
            Composants UI professionnels et accessibles
          </p>
        </div>

        {/* Buttons Section */}
        <Card>
          <CardHeader>
            <CardTitle>Boutons</CardTitle>
            <CardDescription>
              Différentes variantes et tailles de boutons
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Variants */}
              <div>
                <h4 className="text-sm font-medium text-text-secondary mb-3">Variantes</h4>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Primaire</Button>
                  <Button variant="secondary">Secondaire</Button>
                  <Button variant="danger">Danger</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                </div>
              </div>

              {/* Sizes */}
              <div>
                <h4 className="text-sm font-medium text-text-secondary mb-3">Tailles</h4>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Petit</Button>
                  <Button size="md">Moyen</Button>
                  <Button size="lg">Grand</Button>
                </div>
              </div>

              {/* States */}
              <div>
                <h4 className="text-sm font-medium text-text-secondary mb-3">États</h4>
                <div className="flex flex-wrap gap-3">
                  <Button isLoading>Chargement...</Button>
                  <Button disabled>Désactivé</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inputs Section */}
        <Card>
          <CardHeader>
            <CardTitle>Champs de saisie</CardTitle>
            <CardDescription>
              Inputs avec validation et états
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-w-md">
              <Input
                label="Email"
                type="email"
                placeholder="votre@email.com"
                helperText="Nous ne partagerons jamais votre email"
              />
              
              <Input
                label="Nom complet"
                placeholder="Jean Dupont"
                value={inputValue}
                onChange={handleInputChange}
                error={inputError}
              />
              
              <Input
                label="Mot de passe"
                type="password"
                placeholder="••••••••"
              />
              
              <Input
                label="Téléphone"
                type="tel"
                placeholder="+33 6 12 34 56 78"
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                }
              />
              
              <Input
                label="Site web"
                type="url"
                placeholder="https://exemple.com"
                rightIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Cards Section */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-primary">Cartes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card variant="default">
              <CardHeader>
                <CardTitle>Default</CardTitle>
                <CardDescription>Carte par défaut avec bordure</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">
                  Contenu de la carte avec style par défaut.
                </p>
              </CardContent>
            </Card>

            <Card variant="bordered">
              <CardHeader>
                <CardTitle>Bordered</CardTitle>
                <CardDescription>Carte avec bordure accentuée</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">
                  Contenu de la carte avec bordure mise en valeur.
                </p>
              </CardContent>
            </Card>

            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Elevated</CardTitle>
                <CardDescription>Carte avec ombre portée</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-text-secondary">
                  Contenu de la carte avec effet d&apos;élévation.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Card with Footer */}
          <Card variant="elevated" className="max-w-md">
            <CardHeader>
              <CardTitle>Carte complète</CardTitle>
              <CardDescription>Avec header, content et footer</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-text-secondary">
                Cette carte démontre tous les composants disponibles avec un footer contenant des actions.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm">Annuler</Button>
              <Button variant="primary" size="sm">Valider</Button>
            </CardFooter>
          </Card>
        </div>

        {/* Modal Section */}
        <Card>
          <CardHeader>
            <CardTitle>Modal</CardTitle>
            <CardDescription>
              Boîte de dialogue modale avec accessibilité
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setModalOpen(true)}>
              Ouvrir le modal
            </Button>
          </CardContent>
        </Card>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Exemple de Modal"
          description="Ceci est une description du modal pour donner du contexte"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-text-secondary">
              Ce modal démontre les fonctionnalités suivantes :
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-secondary">
              <li>Fermeture avec la touche ESC</li>
              <li>Fermeture en cliquant sur l&apos;overlay</li>
              <li>Bouton de fermeture (×)</li>
              <li>Prévention du scroll du body</li>
              <li>Animations d&apos;entrée/sortie</li>
              <li>Accessibilité (ARIA, focus trap)</li>
            </ul>

            <Input
              label="Testez l'interaction"
              placeholder="Tapez quelque chose..."
            />
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Confirmer
            </Button>
          </ModalFooter>
        </Modal>

        {/* Color Palette */}
        <Card>
          <CardHeader>
            <CardTitle>Palette de couleurs</CardTitle>
            <CardDescription>
              Couleurs de la marque Talentious
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="h-20 rounded-lg bg-primary mb-2"></div>
                <p className="text-sm font-medium">Primary</p>
                <p className="text-xs text-text-secondary">#2D3748</p>
              </div>
              <div>
                <div className="h-20 rounded-lg bg-action mb-2"></div>
                <p className="text-sm font-medium">Action</p>
                <p className="text-xs text-text-secondary">#38A169</p>
              </div>
              <div>
                <div className="h-20 rounded-lg bg-error mb-2"></div>
                <p className="text-sm font-medium">Error</p>
                <p className="text-xs text-text-secondary">#E53E3E</p>
              </div>
              <div>
                <div className="h-20 rounded-lg bg-background-light border border-border mb-2"></div>
                <p className="text-sm font-medium">Background Light</p>
                <p className="text-xs text-text-secondary">#F7FAFC</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
