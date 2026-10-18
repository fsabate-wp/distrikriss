-- La nota de crédito cuelga de la factura que anula (creditedById), no del
-- pedido: una factura y su nota son dos comprobantes de la misma venta.
-- "Invoice.orderId" era NOT NULL y UNIQUE, asi que crear la nota (que va contra
-- el mismo pedido) chocaba con el indice unico y nunca se podia emitir una nota
-- de crédito (P2002 en Invoice.orderId).
--
-- Se libera la columna: la factura conserva su pedido (y su unicidad), y la nota
-- se crea con orderId NULL, enlazada al original por creditedById. La relacion
-- "Order.invoice" (el comprobante del pedido) sigue siendo la factura.
ALTER TABLE "Invoice" ALTER COLUMN "orderId" DROP NOT NULL;
