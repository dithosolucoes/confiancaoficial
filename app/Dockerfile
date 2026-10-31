# Build multi-stage: compila o front-end com Node e serve o dist estático na porta 3000.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Instalação reproduzível a partir do lockfile.
RUN npm ci --no-audit --no-fund

COPY . .

# Variáveis VITE_* são embutidas no bundle no momento do build.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
RUN npm install -g serve@14.2.4

COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

# Modo SPA: rotas desconhecidas voltam para index.html.
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT}"]
