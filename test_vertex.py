#!/usr/bin/env python3
"""
Script de test isolé pour valider l'accès à Vertex AI Gemini
"""

import os
import sys

# Configuration
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.path.expanduser(
    '~/.config/gcloud/application_default_credentials.json'
)

GCP_PROJECT_ID = "talentious-project"
GCP_LOCATION = "europe-west4"
MODEL_NAME = "gemini-1.5-flash"

print("=" * 60)
print("🔍 Test d'accès Vertex AI Gemini")
print("=" * 60)
print(f"Projet : {GCP_PROJECT_ID}")
print(f"Région : {GCP_LOCATION}")
print(f"Modèle : {MODEL_NAME}")
print(f"Credentials : {os.environ['GOOGLE_APPLICATION_CREDENTIALS']}")
print("=" * 60)

try:
    print("\n1️⃣  Import des bibliothèques...")
    import vertexai
    from vertexai.generative_models import GenerativeModel, GenerationConfig
    print("   ✅ Bibliothèques importées")
    
    print("\n2️⃣  Initialisation Vertex AI...")
    vertexai.init(project=GCP_PROJECT_ID, location=GCP_LOCATION)
    print(f"   ✅ Vertex AI initialisé (projet={GCP_PROJECT_ID}, région={GCP_LOCATION})")
    
    print("\n3️⃣  Chargement du modèle...")
    model = GenerativeModel(MODEL_NAME)
    print(f"   ✅ Modèle '{MODEL_NAME}' chargé")
    
    print("\n4️⃣  Configuration de génération...")
    generation_config = GenerationConfig(
        temperature=0.2,
        max_output_tokens=100,
        response_mime_type="application/json"
    )
    print("   ✅ Configuration créée")
    
    print("\n5️⃣  Envoi d'une requête test...")
    prompt = """Réponds uniquement en JSON avec ce format exact :
{"message": "Bonjour", "status": "ok"}"""
    
    response = model.generate_content(
        prompt,
        generation_config=generation_config
    )
    
    print("   ✅ Réponse reçue !")
    print("\n📥 Réponse de Gemini:")
    print("-" * 60)
    print(response.text)
    print("-" * 60)
    
    print("\n✅ ✅ ✅ SUCCÈS ! Vertex AI fonctionne correctement ✅ ✅ ✅\n")
    sys.exit(0)
    
except ImportError as e:
    print(f"\n❌ Erreur d'import : {e}")
    print("\n💡 Solution : Installer les dépendances manquantes")
    print("   pip install google-cloud-aiplatform")
    sys.exit(1)
    
except Exception as e:
    error_msg = str(e)
    print(f"\n❌ Erreur : {error_msg}\n")
    
    # Diagnostic selon le type d'erreur
    if "403" in error_msg or "PermissionDenied" in error_msg:
        print("🔍 DIAGNOSTIC : Problème de permissions IAM")
        print("-" * 60)
        print("Vérifie que ton compte a le rôle 'Vertex AI User' :")
        print(f"\n  gcloud projects get-iam-policy {GCP_PROJECT_ID} \\")
        print(f"    --flatten='bindings[].members' \\")
        print(f"    --filter='bindings.members:$(gcloud config get-value account)' \\")
        print(f"    --format='table(bindings.role)'")
        print("\nPour ajouter le rôle manquant :")
        print(f"\n  gcloud projects add-iam-policy-binding {GCP_PROJECT_ID} \\")
        print(f"    --member='user:$(gcloud config get-value account)' \\")
        print(f"    --role='roles/aiplatform.user'")
        
    elif "404" in error_msg or "not found" in error_msg.lower():
        print("🔍 DIAGNOSTIC : Modèle non trouvé dans cette région")
        print("-" * 60)
        print(f"Le modèle '{MODEL_NAME}' n'est pas disponible dans '{GCP_LOCATION}'")
        print("\nEssaie une autre région européenne :")
        print("  - europe-west1 (Belgique)")
        print("  - europe-west3 (Francfort)")
        print("  - europe-west4 (Pays-Bas) ← actuellement utilisée")
        print("  - europe-west9 (Paris) ← support limité")
        
    elif "billing" in error_msg.lower():
        print("🔍 DIAGNOSTIC : Problème de facturation")
        print("-" * 60)
        print("Vérifie que la facturation est activée :")
        print(f"\n  gcloud billing projects describe {GCP_PROJECT_ID}")
        
    else:
        print("🔍 DIAGNOSTIC : Erreur inattendue")
        print("-" * 60)
        print("Détails complets de l'erreur ci-dessus.")
    
    print("\n" + "=" * 60)
    sys.exit(1)
