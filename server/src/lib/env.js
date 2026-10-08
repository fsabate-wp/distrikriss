import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Carga del .env, en un solo sitio.
 *
 * `dotenv/config` usa el directorio de trabajo, así que un script lanzado desde
 * la raíz del repositorio no encontraba `server/.env` y se caía con
 * "DATABASE_URL no encontrada". Se cargan los dos: el del directorio actual
 * (Docker y despliegues) y el de `server/` (desarrollo y pruebas desde la raíz).
 *
 * Las variables que ya estén en el entorno mandan sobre el archivo, que es lo
 * correcto en producción. `dotenv` no sobreescribe por defecto, así que el
 * orden entre los dos archivos también importa: primero `server/.env`, luego el
 * del directorio actual.
 *
 * Importar este módulo más de una vez no recarga nada.
 *
 * `ENV_FILE` permite elegir el archivo. En pruebas sirve para apuntar a un
 * `.env` vacío y comprobar de verdad qué pasa cuando una variable falta, en vez
 * de que la tapone el archivo de desarrollo.
 */
let cargado = false

export function cargarEnv() {
  if (cargado) return
  cargado = true
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  const elegido = process.env.ENV_FILE
  if (elegido) {
    dotenv.config({ path: path.resolve(aqui, '../../', elegido) })
    return
  }
  dotenv.config({ path: path.resolve(aqui, '../../.env') })
  dotenv.config()
}