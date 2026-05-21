# Stage 1: build
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN bun install

COPY src/ src/
COPY tsconfig.json tsconfig.build.json ./
RUN bun run build

# Stage 2: production
FROM oven/bun:1-alpine
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY --from=builder /app/dist ./dist

VOLUME ["/app/data"]

CMD ["bun", "dist/index.js"]
