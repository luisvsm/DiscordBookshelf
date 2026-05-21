# Stage 1: build
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json ./
RUN bun install

COPY src/ src/
COPY tsconfig.json tsconfig.build.json ./
RUN bun run build

ARG BUILD_VERSION=
RUN echo "{\"version\":\"${BUILD_VERSION}\"}" > version.json

# Stage 2: production
FROM oven/bun:1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/version.json ./version.json

VOLUME ["/app/data"]

CMD ["bun", "dist/index.js"]
