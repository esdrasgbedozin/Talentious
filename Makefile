.PHONY: up down build logs clean restart generate-types generate-types-backend generate-types-frontend generate-types-cv-render generate-types-export-service e2e-export

# -----------------------------------------------------------------------------
# Contract-first: génération des types depuis contracts/openapi.yaml
# Source de vérité unique. Ne jamais éditer les fichiers dans */generated/ à la main.
# -----------------------------------------------------------------------------
BACKEND_PY := backend/.venv-py312/bin/python

generate-types: generate-types-backend generate-types-frontend generate-types-cv-render generate-types-export-service

generate-types-backend:
	backend/.venv-py312/bin/datamodel-codegen \
		--input contracts/openapi.yaml \
		--input-file-type openapi \
		--output backend/app/generated/models.py \
		--output-model-type pydantic_v2.BaseModel \
		--use-standard-collections \
		--use-union-operator \
		--use-schema-description \
		--field-constraints \
		--collapse-root-models \
		--formatters black isort \
		--disable-timestamp \
		--target-python-version 3.11
	@touch backend/app/generated/__init__.py

generate-types-frontend:
	cd frontend && npx --yes openapi-typescript ../contracts/openapi.yaml -o src/generated/api.ts

# Package de rendu partagé : auto-suffisant (consommé par le frontend ET
# l'export-service), il porte sa propre copie générée des types du contrat.
generate-types-cv-render:
	npx --yes openapi-typescript contracts/openapi.yaml -o packages/cv-render/src/generated/api.ts

# Export-service : types TS + artefact de validation ajv, générés depuis SON
# contrat (contracts/agents/export-service.openapi.yaml, $ref inter-fichiers
# vers le canonique — déréférencés dans l'artefact). Prérequis :
# npm ci --workspace export-service (swagger-parser + openapi-typescript,
# versions ÉPINGLÉES par le lockfile — pas de npx flottant : le zéro-diff CI
# dépend de la version du générateur).
generate-types-export-service:
	npm exec --workspace export-service -- openapi-typescript ../contracts/agents/export-service.openapi.yaml -o src/generated/api.ts
	node export-service/scripts/generate-render-schema.mjs

# E2E local du rendu PDF (M2-T13) : service compose (image de prod) + POST
# de la fixture dense => PDF valide. Prérequis : docker-compose up -d export-service.
e2e-export:
	node export-service/scripts/e2e.mjs

up:
	docker-compose up -d

down:
	docker-compose down

build:
	docker-compose build

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	rm -rf backend/__pycache__
	rm -rf backend/app/__pycache__

restart:
	docker-compose restart
