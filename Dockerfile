FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Estas cinco precisam existir DURANTE o `npm run build`, não só quando o
# contêiner roda. As `NEXT_PUBLIC_*` o Next escreve dentro do bundle; e o
# `API_INTERNA_URL` vira o destino do rewrite de `/api/*` no
# `routes-manifest.json`, calculado uma vez no build. Passadas só em runtime,
# o bundle nasce com `undefined` e o rewrite nem existe — o site sobe, e toda
# chamada à API cai num 404 do próprio Next.
ARG NEXT_PUBLIC_DOMINIO_BASE
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_URL_BASE
ARG NEXT_PUBLIC_TENANT_PADRAO=""
ARG API_INTERNA_URL
ENV NEXT_PUBLIC_DOMINIO_BASE=$NEXT_PUBLIC_DOMINIO_BASE \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_URL_BASE=$NEXT_PUBLIC_URL_BASE \
    NEXT_PUBLIC_TENANT_PADRAO=$NEXT_PUBLIC_TENANT_PADRAO \
    API_INTERNA_URL=$API_INTERNA_URL
RUN npm run build

FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
# O `server.js` do standalone escuta em `process.env.HOSTNAME`, e o Docker
# preenche HOSTNAME com o id do contêiner. Sem isto o Next escuta só nesse
# nome, e o proxy que chega por outra interface da rede leva conexão recusada.
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
