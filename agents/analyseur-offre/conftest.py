"""Rend le paquet `app` importable quand pytest s'exécute depuis ce dossier
(harnais de tests de l'agent, M5-T00). L'app est importable SANS google-genai
(imports paresseux du service Vertex), donc les tests tournent avec les seules
dépendances backend, en local comme en CI."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
