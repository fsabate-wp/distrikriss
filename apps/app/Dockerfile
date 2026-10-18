FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY server/package.json server/package.json

RUN npm ci

COPY apps/app/ apps/app/

RUN npm run build --workspace @distrikriss/app

FROM nginx:1.27-alpine
# La URL de la API y la clave VAPID se resuelven en el arranque (no en el build):
# runtime-config.sh escribe /config.js desde el entorno antes de servir.
COPY apps/app/runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
COPY apps/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/app/dist /usr/share/nginx/html
EXPOSE 80
