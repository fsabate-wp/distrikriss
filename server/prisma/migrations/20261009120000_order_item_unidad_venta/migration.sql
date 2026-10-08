-- El comprobante tiene que decir "2 cajas", no "800 gramos": el gramo es un
-- dato referencial y la caja es lo que el cliente compró.
--
-- Se guarda el tamaño del empaque en la línea del pedido porque el tendero
-- puede cambiarlo después. Un comprobante ya autorizado debe seguir diciendo
-- "caja de 400 g" aunque la caja ahora sea de 500 g: los dos datos quedan
-- congelados en la línea que los generó.
--
-- Ambas columnas admiten NULL a propósito: los pedidos anteriores a este cambio
-- no tienen el dato, y un comprobante viejo no se puede reescribir.

ALTER TABLE "OrderItem"
  ADD COLUMN "unitQuantity" DECIMAL(10, 2);

ALTER TABLE "OrderItem"
  ADD COLUMN "saleUnitName" TEXT;