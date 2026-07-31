import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL || '30d',
  },
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  publicApiUrl: process.env.PUBLIC_API_URL || 'http://localhost:4000',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  landingUrl: process.env.LANDING_URL || 'http://localhost:5174',
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: process.env.ADMIN_EMAIL || 'admin@distrikriss.com',
    password: process.env.ADMIN_PASSWORD || 'distrikriss-admin',
    phone: process.env.ADMIN_PHONE || '0959841957',
  },
}
