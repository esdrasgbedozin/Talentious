#!/usr/bin/env python3
"""
Script d'évaluation end-to-end pour le pipeline de génération de CV.

Ce script teste toutes les combinaisons de profils × offres en appelant :
1. L'Analyseur-Offre (analyse de l'offre d'emploi)
2. Le Rédacteur-CV (génération du CV optimisé)

Les résultats sont sauvegardés dans backend/evals/results/ pour inspection manuelle.

Usage:
    python backend/evals/run_evals.py

Prérequis:
    - Les services Docker doivent être lancés (analyseur-offre, redacteur-cv)
    - Les profils doivent être dans backend/evals/profiles/*.json
    - Les offres doivent être dans backend/evals/offers/*.txt
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple
import httpx
from datetime import datetime


# ===== CONFIGURATION =====
ANALYZER_URL = "http://analyseur-offre:8002/analyze"
WRITER_URL = "http://redacteur-cv:8003/generate"

# Chemins relatifs au script
SCRIPT_DIR = Path(__file__).parent
PROFILES_DIR = SCRIPT_DIR / "profiles"
OFFERS_DIR = SCRIPT_DIR / "offers"
RESULTS_DIR = SCRIPT_DIR / "results"

# Timeout pour les requêtes HTTP (10 minutes pour accommoder les retry logic + génération Gemini pour profils détaillés)
TIMEOUT = 600.0

# ===== COULEURS ANSI POUR LE TERMINAL =====
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_header(text: str) -> None:
    """Affiche un en-tête formaté."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(80)}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}\n")


def print_success(text: str) -> None:
    """Affiche un message de succès."""
    print(f"{Colors.OKGREEN}✅ {text}{Colors.ENDC}")


def print_error(text: str) -> None:
    """Affiche un message d'erreur."""
    print(f"{Colors.FAIL}❌ {text}{Colors.ENDC}")


def print_info(text: str) -> None:
    """Affiche un message informatif."""
    print(f"{Colors.OKCYAN}ℹ️  {text}{Colors.ENDC}")


def print_warning(text: str) -> None:
    """Affiche un avertissement."""
    print(f"{Colors.WARNING}⚠️  {text}{Colors.ENDC}")


def load_profiles() -> List[Tuple[str, Dict[str, Any]]]:
    """
    Charge tous les profils depuis backend/evals/profiles/*.json
    
    Returns:
        Liste de tuples (filename, profile_data)
    """
    profiles = []
    if not PROFILES_DIR.exists():
        print_error(f"Le dossier {PROFILES_DIR} n'existe pas")
        return profiles
    
    for profile_file in sorted(PROFILES_DIR.glob("*.json")):
        try:
            with open(profile_file, 'r', encoding='utf-8') as f:
                profile_data = json.load(f)
                profiles.append((profile_file.name, profile_data))
                print_success(f"Profil chargé : {profile_file.name}")
        except Exception as e:
            print_error(f"Erreur lors du chargement de {profile_file.name}: {e}")
    
    return profiles


def load_offers() -> List[Tuple[str, str]]:
    """
    Charge toutes les offres depuis backend/evals/offers/*.txt
    
    Returns:
        Liste de tuples (filename, offer_text)
    """
    offers = []
    if not OFFERS_DIR.exists():
        print_error(f"Le dossier {OFFERS_DIR} n'existe pas")
        return offers
    
    for offer_file in sorted(OFFERS_DIR.glob("*.txt")):
        try:
            with open(offer_file, 'r', encoding='utf-8') as f:
                offer_text = f.read()
                offers.append((offer_file.name, offer_text))
                print_success(f"Offre chargée : {offer_file.name}")
        except Exception as e:
            print_error(f"Erreur lors du chargement de {offer_file.name}: {e}")
    
    return offers


def analyze_offer(client: httpx.Client, offer_text: str) -> Dict[str, Any]:
    """
    Appelle l'Analyseur-Offre pour analyser une offre d'emploi.
    
    Args:
        client: Client HTTP
        offer_text: Texte de l'offre d'emploi
        
    Returns:
        Analyse structurée de l'offre (JSON)
        
    Raises:
        httpx.HTTPError: En cas d'erreur HTTP
    """
    response = client.post(
        ANALYZER_URL,
        json={"text": offer_text},  # Changed from "job_description" to "text"
        timeout=TIMEOUT
    )
    response.raise_for_status()
    return response.json()


def generate_cv(
    client: httpx.Client,
    profile_data: Dict[str, Any],
    offer_analysis: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Appelle le Rédacteur-CV pour générer un CV optimisé.
    
    Args:
        client: Client HTTP
        profile_data: Données du profil utilisateur
        offer_analysis: Analyse de l'offre d'emploi
        
    Returns:
        CV généré au format JSON
        
    Raises:
        httpx.HTTPError: En cas d'erreur HTTP
    """
    payload = {
        "user_profile": profile_data,  # Changed from "profile_data" to "user_profile" to match GenerateRequest model
        "offer_analysis": offer_analysis
    }
    
    # Debug: Print payload structure
    print_info(f"📤 Payload keys: user_profile={list(profile_data.keys())[:5]}, offer_analysis={list(offer_analysis.keys())}")
    
    response = client.post(
        WRITER_URL,
        json=payload,
        timeout=TIMEOUT
    )
    response.raise_for_status()
    return response.json()


def save_result(
    profile_name: str,
    offer_name: str,
    cv_data: Dict[str, Any],
    offer_analysis: Dict[str, Any]
) -> None:
    """
    Sauvegarde le résultat de l'évaluation dans backend/evals/results/
    
    Args:
        profile_name: Nom du fichier profil (ex: "01_junior_dev.json")
        offer_name: Nom du fichier offre (ex: "01_tech_lead.txt")
        cv_data: CV généré
        offer_analysis: Analyse de l'offre
    """
    # Extraire les numéros des noms de fichiers (ex: "01" de "01_junior_dev.json")
    profile_num = profile_name.split('_')[0]
    offer_num = offer_name.split('_')[0]
    
    result_filename = f"result_{profile_num}_{offer_num}.json"
    result_path = RESULTS_DIR / result_filename
    
    # Créer le dossier results s'il n'existe pas
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Préparer les métadonnées
    result_data = {
        "metadata": {
            "profile_file": profile_name,
            "offer_file": offer_name,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "pipeline_version": "1.0.0"
        },
        "offer_analysis": offer_analysis,
        "generated_cv": cv_data
    }
    
    # Sauvegarder avec indentation pour lisibilité
    with open(result_path, 'w', encoding='utf-8') as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2)
    
    print_success(f"Résultat sauvegardé : {result_filename}")


def run_evals() -> None:
    """
    Fonction principale : charge les données, exécute toutes les combinaisons,
    et génère un rapport final.
    """
    print_header("🚀 DÉMARRAGE DES TESTS D'ÉVALUATION (EVALS)")
    
    # Chargement des données
    print_info("Chargement des profils...")
    profiles = load_profiles()
    
    print_info("Chargement des offres...")
    offers = load_offers()
    
    if not profiles:
        print_error("Aucun profil trouvé. Impossible de continuer.")
        sys.exit(1)
    
    if not offers:
        print_error("Aucune offre trouvée. Impossible de continuer.")
        sys.exit(1)
    
    total_combinations = len(profiles) * len(offers)
    print_header(f"📊 {total_combinations} COMBINAISONS À TRAITER")
    print_info(f"Profils : {len(profiles)}")
    print_info(f"Offres : {len(offers)}")
    
    # Statistiques
    success_count = 0
    error_count = 0
    errors_details = []
    
    # Client HTTP avec timeout configuré
    with httpx.Client() as client:
        # Boucle sur toutes les combinaisons
        for profile_idx, (profile_name, profile_data) in enumerate(profiles, 1):
            for offer_idx, (offer_name, offer_text) in enumerate(offers, 1):
                combination_num = (profile_idx - 1) * len(offers) + offer_idx
                
                print_header(
                    f"🔄 COMBINAISON {combination_num}/{total_combinations}: "
                    f"{profile_name} × {offer_name}"
                )
                
                try:
                    # Étape 1 : Analyser l'offre
                    print_info("Étape 1/2 : Analyse de l'offre d'emploi...")
                    offer_analysis = analyze_offer(client, offer_text)
                    print_success(
                        f"Offre analysée : {len(offer_analysis.get('hard_skills', []))} "
                        f"hard skills, {len(offer_analysis.get('soft_skills', []))} soft skills"
                    )
                    
                    # Étape 2 : Générer le CV
                    print_info("Étape 2/2 : Génération du CV optimisé...")
                    cv_response = generate_cv(client, profile_data, offer_analysis)
                    cv_data = cv_response.get('cv_data', {})  # Extract cv_data from response
                    print_success(
                        f"CV généré : {len(cv_data.get('selected_experiences', []))} "
                        f"expériences, {len(cv_data.get('highlighted_skills', []))} compétences"
                    )
                    
                    # Sauvegarder le résultat
                    save_result(profile_name, offer_name, cv_response, offer_analysis)
                    
                    success_count += 1
                    
                except httpx.HTTPError as e:
                    error_msg = f"{profile_name} × {offer_name}: Erreur HTTP - {e}"
                    print_error(error_msg)
                    errors_details.append(error_msg)
                    error_count += 1
                    
                except Exception as e:
                    error_msg = f"{profile_name} × {offer_name}: {type(e).__name__} - {e}"
                    print_error(error_msg)
                    errors_details.append(error_msg)
                    error_count += 1
    
    # Rapport final
    print_header("📈 RAPPORT FINAL DES ÉVALUATIONS")
    
    print_info(f"Total de combinaisons : {total_combinations}")
    print_success(f"Succès : {success_count}/{total_combinations}")
    
    if error_count > 0:
        print_error(f"Échecs : {error_count}/{total_combinations}")
        print_warning("\nDétail des erreurs :")
        for error in errors_details:
            print(f"  • {error}")
    
    success_rate = (success_count / total_combinations * 100) if total_combinations > 0 else 0
    
    if success_rate == 100:
        print_success(f"\n🎉 TOUS LES TESTS ONT RÉUSSI ! (100%)")
    elif success_rate >= 80:
        print_warning(f"\n⚠️  Tests partiellement réussis ({success_rate:.1f}%)")
    else:
        print_error(f"\n❌ Taux d'échec élevé ({100-success_rate:.1f}%)")
    
    print_info(f"\nRésultats disponibles dans : {RESULTS_DIR}")
    
    # Code de sortie
    sys.exit(0 if error_count == 0 else 1)


if __name__ == "__main__":
    try:
        run_evals()
    except KeyboardInterrupt:
        print_warning("\n\n⚠️  Évaluations interrompues par l'utilisateur")
        sys.exit(130)
    except Exception as e:
        print_error(f"\n\n💥 Erreur fatale : {type(e).__name__} - {e}")
        sys.exit(1)
