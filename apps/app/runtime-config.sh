#!/bin/sh
# Configuración del front en tiempo de arranque.
#
# El bundle no lleva la URL de la API ni la clave VAPID: se escriben aquí desde
# el entorno, de modo que la misma imagen sirve para cualquier entorno. Nginx
# ejecuta este script (está en /docker-entrypoint.d/) antes de arrancar.
set -e

: "${API_URL:=http://localhost:4000}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = { apiUrl: "${API_URL}", vapidPublicKey: "${VAPID_PUBLIC_KEY:-}" };
EOF

echo "-> config del front escrita (apiUrl=${API_URL})"
