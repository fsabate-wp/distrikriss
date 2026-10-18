-- Version de sesion por usuario: al cerrar sesion se incrementa y todos los
-- refresh tokens emitidos antes quedan invalidos.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
