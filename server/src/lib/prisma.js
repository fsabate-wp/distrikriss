import { cargarEnv } from './env.js'
import { PrismaClient } from '@prisma/client'

// El cliente lee DATABASE_URL al construirse, así que el .env tiene que estar
// cargado antes. Sin esto, un script que solo importe prisma.js (como
// tests/verify-schema.mjs) fallaba al lanzarse desde la raíz del repositorio.
cargarEnv()

export const prisma = new PrismaClient()