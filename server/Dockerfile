FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY server/package.json server/package.json

RUN npm ci

COPY server/ server/

RUN npx prisma generate --schema=server/prisma/schema.prisma

COPY server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000

CMD ["/entrypoint.sh"]
