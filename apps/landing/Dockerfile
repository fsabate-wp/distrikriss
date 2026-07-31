FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY server/package.json server/package.json

RUN npm ci

COPY apps/landing/ apps/landing/

ARG VITE_APP_URL
ENV VITE_APP_URL=$VITE_APP_URL

RUN npm run build --workspace @distrikriss/landing

FROM nginx:1.27-alpine
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/landing/dist /usr/share/nginx/html
EXPOSE 80
