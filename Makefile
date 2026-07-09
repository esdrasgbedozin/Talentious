.PHONY: up down build logs clean restart generate-types generate-types-backend generate-types-frontend

# -----------------------------------------------------------------------------
# Contract-first: génération des types depuis contracts/openapi.yaml
# Source de vérité unique. Ne jamais éditer les fichiers dans */generated/ à la main.
# -----------------------------------------------------------------------------
BACKEND_PY := backend/.venv-py312/bin/python

generate-types: generate-types-backend generate-types-frontend

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
