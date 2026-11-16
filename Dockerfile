FROM oven/bun:1.4.4-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server ./server
COPY shared ./shared
COPY packages ./packages
COPY apps/preview ./apps/preview

ENV NODE_ENV=production PORT=10000 NICKEL_DATA_DIR=/var/data/nickel
RUN mkdir -p /var/data/nickel
EXPOSE 10000
CMD ["bun", "server/index.ts"]
