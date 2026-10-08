-- El precio del catálogo es el de la unidad mínima (la bandeja), no el de una
-- unidad de medida: $1 por una bandeja de 400 g son $0.0025 por gramo.
--
-- Con DECIMAL(10,2) ese valor se guardaba como 0.00 y el total de la línea se
-- perdía. Se amplía a 6 decimales, que es lo que el XML del SRI ya emite en
-- <precioUnitario>.
--
-- Este ALTER solo cambia la escala de las columnas: no toca ningún valor.

ALTER TABLE "OrderItem"
  ALTER COLUMN "price" TYPE DECIMAL(16, 6) USING "price"::DECIMAL(16, 6);

ALTER TABLE "OrderItem"
  ALTER COLUMN "listPrice" TYPE DECIMAL(16, 6) USING "listPrice"::DECIMAL(16, 6);