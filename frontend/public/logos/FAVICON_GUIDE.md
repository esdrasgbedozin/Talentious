# Génération du Favicon et des icônes PWA

## État actuel
- ✅ Logos SVG disponibles dans `public/logos/`
- ✅ `site.webmanifest` créé
- ✅ Layout configuré pour utiliser le logomark comme icône

## À faire : Générer favicon.ico et icônes PNG

### Option 1 : Outil en ligne (Recommandé - Simple)

1. Aller sur **https://realfavicongenerator.net/**
2. Uploader `public/logos/talentious-mark.svg`
3. Configurer les options :
   - iOS : Utiliser le logomark
   - Android Chrome : Background color `#2D3748` (primary)
   - Windows Metro : Background color `#2D3748`
4. Télécharger le package
5. Extraire les fichiers dans `frontend/public/`

Fichiers générés :
- `favicon.ico` (multi-résolution)
- `icon-192.png` (Android)
- `icon-512.png` (Android)
- `apple-touch-icon.png` (180x180)

### Option 2 : ImageMagick (Ligne de commande)

Si ImageMagick est installé sur ton Mac :

```bash
cd frontend/public/logos

# Convertir SVG en PNG haute résolution
convert -background none -resize 512x512 talentious-mark.svg icon-512-temp.png
convert -background none -resize 192x192 talentious-mark.svg icon-192-temp.png
convert -background none -resize 180x180 talentious-mark.svg apple-touch-icon-temp.png

# Ajouter un background si nécessaire (optionnel)
convert icon-512-temp.png -background "#2D3748" -alpha remove -alpha off ../icon-512.png
convert icon-192-temp.png -background "#2D3748" -alpha remove -alpha off ../icon-192.png
convert apple-touch-icon-temp.png -background "#2D3748" -alpha remove -alpha off ../apple-touch-icon.png

# Générer favicon.ico (multi-résolution)
convert -background none -resize 16x16 talentious-mark.svg favicon-16.png
convert -background none -resize 32x32 talentious-mark.svg favicon-32.png
convert -background none -resize 48x48 talentious-mark.svg favicon-48.png
convert favicon-16.png favicon-32.png favicon-48.png ../favicon.ico

# Nettoyer les fichiers temporaires
rm *-temp.png favicon-*.png
```

### Option 3 : macOS Preview + Export manuel

1. Ouvrir `talentious-mark.svg` dans Preview
2. Fichier > Exporter
3. Créer les tailles :
   - 512x512 → `icon-512.png`
   - 192x192 → `icon-192.png`
   - 180x180 → `apple-touch-icon.png`
4. Pour favicon.ico, utiliser un outil en ligne : https://www.icoconverter.com/

## Vérification

Une fois les fichiers générés, vérifier :
- `frontend/public/favicon.ico`
- `frontend/public/icon-192.png`
- `frontend/public/icon-512.png`
- `frontend/public/apple-touch-icon.png`

Puis tester :
- Ouvrir http://localhost:3001
- Vérifier que l'icône apparaît dans l'onglet du navigateur
- Ajouter aux favoris et vérifier l'icône
