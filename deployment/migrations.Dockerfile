FROM node:24.20.0-alpine AS dependencies
RUN apk add --no-cache openssl
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY backend/ ./
RUN npm run generate:test

FROM node:24.20.0-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=dependencies --chown=node:node /app /app
COPY --chown=node:node deployment/migrate.cjs ./migrate.cjs
USER node
ENTRYPOINT ["node","migrate.cjs"]
