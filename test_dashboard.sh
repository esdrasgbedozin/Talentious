#!/bin/bash

# Script pour tester la page Dashboard en créant des CVs de test

echo "🔐 Connexion en tant qu'utilisateur test..."

# Login pour obtenir le token (form data)
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=testpassword123")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Erreur: Impossible de se connecter. Réponse:"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Token obtenu: ${TOKEN:0:20}..."

# Créer quelques CVs de test
echo ""
echo "📄 Création de CVs de test..."

echo "1️⃣ CV pour Software Engineer..."
curl -s -X POST http://localhost:8000/cv \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cv_name": "CV Software Engineer - Google",
    "template_id": "modern",
    "job_offer_context": "Poste de Software Engineer chez Google, nécessitant expertise en Python et systèmes distribués.",
    "cv_data_json": {
      "personal_info": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }' | python3 -m json.tool

echo ""
echo "2️⃣ CV pour Data Scientist..."
curl -s -X POST http://localhost:8000/cv \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cv_name": "CV Data Scientist - Meta",
    "template_id": "modern",
    "job_offer_context": "Data Scientist chez Meta, spécialisé en ML et analyse de données.",
    "cv_data_json": {
      "personal_info": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }' | python3 -m json.tool

echo ""
echo "3️⃣ CV pour Product Manager..."
curl -s -X POST http://localhost:8000/cv \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cv_name": "CV Product Manager - Amazon",
    "template_id": "modern",
    "job_offer_context": "Product Manager chez Amazon, focus sur l'\''innovation produit.",
    "cv_data_json": {
      "personal_info": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }' | python3 -m json.tool

echo ""
echo "📋 Liste des CVs créés:"
curl -s -X GET http://localhost:8000/cv \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "✅ CVs de test créés avec succès!"
echo "🌐 Ouvrez http://localhost:3000/dashboard pour voir la page"
