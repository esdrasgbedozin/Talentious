# Image de DEV du frontend (docker-compose). Build en CONTEXTE RACINE du
# monorepo (workspaces npm) depuis M0-T08 : le frontend importe le package
# partagé @talentious/cv-render, qui vit hors de frontend/. Le build de PROD est
# frontend/Dockerfile.prod. La source est montée en volume par docker-compose et
# le serveur tourne en mode dev (hot reload).
FROM node:20-slim
WORKDIR /app

# Manifestes des workspaces + lockfile racine (couche d'install mise en cache).
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY packages/cv-render/package.json ./packages/cv-render/
RUN npm install

# Sources (écrasées au runtime par les volumes docker-compose, mais présentes
# pour un `docker build` autonome).
COPY frontend ./frontend
COPY packages ./packages

# Build arguments for environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ENVIRONMENT
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID

# Set environment variables for build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ENVIRONMENT=$NEXT_PUBLIC_ENVIRONMENT \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

WORKDIR /app/frontend
EXPOSE 3000
# Mode dev (hot reload) — cohérent avec les volumes montés + WATCHPACK_POLLING.
CMD ["npm", "run", "dev"]
