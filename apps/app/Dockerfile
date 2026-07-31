FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY server/package.json server/package.json

RUN npm ci

COPY apps/app/ apps/app/

ARG VITE_API_URL
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY

RUN npm run build --workspace @distrikriss/app

FROM nginx:1.27-alpine
COPY apps/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/app/dist /usr/share/nginx/html
EXPOSE 80
