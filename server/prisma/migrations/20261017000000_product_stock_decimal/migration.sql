-- El stock comparte unidad con la cantidad (gramos, kilos, unidades) y la
-- cantidad de la linea es DECIMAL(10,2), porque a granel se vende por tramos
-- como 0.5 kg o 1.5 kg. Con "stock" en INTEGER, descontar 1.5 dejaba el stock
-- invalido (Postgres redondeaba) o el pedido fallaba al intentar rebajar una
-- fraccion. Ahora el stock admite decimales, igual que la cantidad.
--
-- El valor -1 (sin limite) sigue siendo valido: la comparacion es "stock >= 0".
ALTER TABLE "Product" ALTER COLUMN "stock" TYPE DECIMAL(10,2) USING "stock"::DECIMAL(10,2);
