#!/usr/bin/env python3
"""
LLM-judge scoring for CV generation evals.

Scores every result JSON in a directory on a fixed rubric (0-10 per criterion),
using a strong judge model (default gemini-2.5-pro) independent of the model that
produced the CV. Outputs per-file and mean scores so two runs (e.g. baseline_flash
vs pro_tier) can be compared objectively.

Runs inside an agent container (needs the vertexai SDK + ADC).

Usage (inside redacteur-cv container):
    python score_evals.py /evals/results/baseline_flash
    JUDGE_MODEL=gemini-2.5-pro python score_evals.py /evals/results/pro_tier
"""

import json
import os
import sys
from pathlib import Path

import vertexai
from vertexai.generative_models import GenerationConfig, GenerativeModel

PROJECT = os.getenv("GCP_PROJECT_ID", "talentious-project")
LOCATION = os.getenv("GCP_LOCATION", "europe-west9")
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "gemini-2.5-pro")

CRITERIA = [
    "pertinence",  # le CV cible-t-il vraiment l'offre analysée ?
    "verbes_action",  # les descriptions emploient-elles des verbes d'action forts ?
    "metriques",  # présence de réalisations chiffrées / concrètes ?
    "francais",  # qualité et registre du français (soutenu, sans faute) ?
    "fidelite_profil",  # le contenu reste fidèle au profil (pas d'invention) ?
]

RUBRIC = (
    "Tu es un recruteur senior francophone. On te donne (1) l'analyse d'une offre "
    "d'emploi et (2) un CV généré pour cette offre. Note le CV de 0 à 10 sur chaque "
    "critère suivant : " + ", ".join(CRITERIA) + ". Réponds STRICTEMENT en JSON : "
    '{"pertinence": int, "verbes_action": int, "metriques": int, '
    '"francais": int, "fidelite_profil": int, "commentaire": "une phrase"}.'
)


def _cv_of(result: dict) -> dict:
    gen = result.get("generated_cv", {})
    return gen.get("cv_data", gen)


def score_file(judge: GenerativeModel, path: Path) -> dict:
    result = json.loads(path.read_text())
    payload = {
        "offer_analysis": result.get("offer_analysis"),
        "generated_cv": _cv_of(result),
    }
    prompt = RUBRIC + "\n\n### DONNÉES ###\n" + json.dumps(payload, ensure_ascii=False)
    resp = judge.generate_content(
        prompt,
        generation_config=GenerationConfig(
            temperature=0.0, response_mime_type="application/json"
        ),
    )
    scores = json.loads(resp.text)
    scores["_mean"] = round(sum(scores[c] for c in CRITERIA) / len(CRITERIA), 2)
    return scores


def main() -> None:
    results_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "/evals/results")
    vertexai.init(project=PROJECT, location=LOCATION)
    judge = GenerativeModel(JUDGE_MODEL)

    files = sorted(results_dir.glob("result_*.json"))
    if not files:
        print(f"No result_*.json in {results_dir}")
        return

    means = []
    print(f"Judge: {JUDGE_MODEL} | dir: {results_dir}")
    for f in files:
        s = score_file(judge, f)
        means.append(s["_mean"])
        print(
            f"  {f.name}: mean={s['_mean']} "
            + " ".join(f"{c}={s[c]}" for c in CRITERIA)
        )
    overall = round(sum(means) / len(means), 2)
    print(f"OVERALL MEAN ({len(files)} CVs): {overall}")


if __name__ == "__main__":
    main()
