/**
 * Reglas del admin que siembra `seed.js`.
 *
 * Se separa aquí para poder probarlas sin base de datos ni `bcrypt`. El valor por
 * defecto coincide con `DEFAULTS.adminPassword` de `src/config.js`.
 */
export const ADMIN_PASSWORD_POR_DEFECTO = 'distrikriss-admin'

/** Contraseña resuelta y si es la de por defecto (la conocida). */
export function resolveAdminPassword(env = process.env) {
  const password = env.ADMIN_PASSWORD || ADMIN_PASSWORD_POR_DEFECTO
  return { password, esPorDefecto: password === ADMIN_PASSWORD_POR_DEFECTO }
}

/**
 * En producción el seed NO debe crear el admin con la contraseña conocida:
 * cualquiera podría entrar. Se detiene antes de tocar la base, en la misma línea
 * que la comprobación de `config.js` (que ya impide arrancar la API).
 */
export function assertSeedAdminPassword(env = process.env) {
  const resuelto = resolveAdminPassword(env)
  if (env.NODE_ENV === 'production' && resuelto.esPorDefecto) {
    throw new Error(
      'ADMIN_PASSWORD no está definida (o es la de por defecto) en producción. ' +
        'El seed se detiene para no crear un admin con una contraseña conocida. ' +
        'Genera una con: openssl rand -base64 24',
    )
  }
  return resuelto
}

/**
 * Qué hacer con el admin que ya existe (o no).
 *
 * - `crear`: no existe, se crea.
 * - `rotar`: existe pero su contraseña sigue siendo la de por defecto y ahora hay
 *   una nueva configurada. Corrige un despliegue previo que lo sembró inseguro.
 * - `dejar`: no se toca (se respeta la contraseña que el operador haya puesto en
 *   la app, aunque luego cambie la variable).
 */
export function decisionAdminSeed({ existe, coincidePorDefecto, esPorDefecto }) {
  if (!existe) return 'crear'
  if (!esPorDefecto && coincidePorDefecto) return 'rotar'
  return 'dejar'
}
