FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

LABEL org.opencontainers.image.source="https://github.com/andersennl/finanzen"

VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "server.js"]
