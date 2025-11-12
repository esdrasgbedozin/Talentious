FROM python:3.11-slim

WORKDIR /evals

# Installer httpx
RUN pip install --no-cache-dir httpx==0.27.0

# Copier les scripts et données
COPY backend/evals/run_evals.py ./run_evals.py
COPY backend/evals/profiles ./profiles
COPY backend/evals/offers ./offers

# Créer le dossier results
RUN mkdir -p ./results

# Point d'entrée
CMD ["python", "run_evals.py"]
