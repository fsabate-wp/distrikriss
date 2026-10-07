# Proceso de compra

Recorrido completo desde que el cliente abre el producto hasta que el pedido
llega al panel. Documenta las reglas que el servidor aplica y por qué, para que
un cambio no rompa silenciosamente la coherencia entre lo que ve el cliente y lo
que se cobra.

## Reglas de precio

La regla vive en **`server/src/lib/precios.js`** y está replicada en
`apps/app/src/utils/format.js`. `tests/precios.test.js` recorre ~50.000
combinaciones de precio y descuento comparando ambas copias: si divergen, el
carrito muestra una cifra y el pedido cobra otra.

| Concepto | Regla |
|---|---|
| Precio de catálogo | IVA incluido (es lo que ve el consumidor) |
| Descuento | 0–100 %, aplicado sobre el precio de lista |
| Precio unitario cobrado | `round2(precio * (1 - descuento/100))` |
| Subtotal | Suma de líneas, con `round2` en cada una |
| Total | Subtotal + envío, redondeado a dos decimales |

El servidor **nunca** toma el precio del cliente: siempre lo lee del catálogo y
lo calcula. El carrito guarda un precio para mostrarlo, pero es informativo.

## Carrito

Persiste en `localStorage` bajo `distrikriss-cart`. Al abrir el checkout se
reconcilia contra el catálogo (`reconcileCart` en `CheckoutView.vue`):

- Producto desaparecido o desactivado → se quita y se avisa.
- Precio o descuento cambiados → se actualiza y se avisa con la cifra anterior.
- Cantidad por encima del stock → se ajusta al stock disponible.
- Cantidad por debajo del mínimo → se sube al mínimo.
- Cantidad fuera del paso de venta → se ajusta al múltiplo más cercano.

Sin esta reconciliación, el cliente veía el total del carrito y el servidor
cobraba el precio nuevo: un pedido pagado de más o de menos según cuándo se
miró.

## Checkout: qué valida el servidor

En este orden (`routes/orders.routes.js`):

1. **Tienda abierta** (`requireStoreOpen` en el catálogo y el checkout).
2. **Dirección**: debe pertenecer al usuario si es guardada, o venir completa si
   es nueva.
3. **Zona de entrega**: la dirección debe caer dentro de una zona habilitada.
4. **Fecha de entrega**: día con entregas programadas, no pasado, dentro del
   límite de anticipación (30 días) y antes de la hora de corte si es hoy.
5. **Horario**: debe existir en la zona y tener plaza. La reserva definitiva se
   hace dentro de la transacción.
6. **Stock**: por producto, sumando todas sus líneas. `stock = -1` significa sin
   límite.
7. **Cantidad mínima** y **paso de venta** por producto.
8. **Pedido mínimo de la zona**: se mide sobre el **subtotal de productos**. El
   envío no cuenta, y el mensaje al cliente lo dice explícitamente.
9. **Facturación**: si se pide RUC, se valida el dígito verificador.

El cliente ve las mismas comprobaciones en el formulario, pero la validación del
servidor es la que manda. Un `canSubmit` en false es una cortesía, no una
garantía.

## Reserva de horario y stock

Ambas reservas son atómicas y ocurren dentro de la misma transacción que crea el
pedido.

**Horario.** `reserveSlot` bloquea una fila de `SlotLock` con `FOR UPDATE` y
después cuenta. No se puede bloquear mientras se cuenta (PostgreSQL rechaza
`FOR UPDATE` con agregados), así que existe una fila por horario que serializa a
todos los que compiten. Resultado: si dos personas ven "disponible" a la vez y
hay una plaza, **una gana y la otra recibe `409 SLOT_FULL`**.

**Stock.** El decremento lleva la condición en la propia sentencia:

```sql
UPDATE "Product" SET stock = stock - $cantidad
WHERE id = $id AND stock >= $cantidad
```

Si no afecta filas, el stock se agotó mientras el cliente confirmaba y se
devuelve `409 OUT_OF_STOCK`. El stock nunca queda negativo.

## Numeración de pedidos

`OrderSequence` mantiene el correlativo con `INSERT ... ON CONFLICT DO UPDATE ...
RETURNING`, que es atómico. Antes se usaba `count() + 1`: dos pedidos
simultáneos obtenían el mismo código y, como `Order.code` es `UNIQUE`, el segundo
moría con un 500.

Los huecos son aceptables: si una transacción se revierte tras tomar el número,
ese número se pierde. Es preferible un hueco a un código duplicado.

El servidor siembra el contador al arrancar, por encima del código más alto
existente, para no repetir ninguno tras restaurar una copia de la base.

## Estados del pedido

```
PENDING → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
    └──────────────→ CANCELLED ──────────────┘
```

- El **cliente** solo puede cancelar en `PENDING` y `CONFIRMED`.
- El **admin** no puede cambiar un pedido en `DELIVERED` o `CANCELLED`.
- Cancelar devuelve el stock y libera el horario.
- Cancelar un pedido cuya factura ya está **autorizada** se bloquea: hace falta
  una nota de crédito.

## Pagos

| Método | `paymentStatus` | Cuándo se cobra | Cuándo se factura |
|---|---|---|---|
| `COD` | `PENDING` → `PAID` al entregar | En la entrega | Al pasar a `DELIVERED` |
| `TRANSFER` | `PENDING` → `PAID` al confirmar | Antes de entregar | Al marcar `PAID` |

La factura se emite **cuando el pago se confirma**, no al crear el pedido: una
factura electrónica documenta una operación ejecutada.

### Datos bancarios

Se guardan cifrados en `Settings.bankTransferEnc` con AES-256-GCM. Se exponen al
cliente únicamente en `/api/settings/public`, porque los necesita para pagar. La
contraseña del certificado y la clave de cifrado comparten `SRI_CERT_SECRET`.

**Rotar `SRI_CERT_SECRET`** invalida tanto la contraseña del certificado como los
datos bancarios: el panel pedirá reintroducirlos.

## Validaciones de entrada

- `quantity` se convierte con `z.coerce.number()`: un cliente que mande
  `"mucho"` o `"2; DROP TABLE"` recibe un 400, no un error de base de datos.
- Máximo 5000 unidades por línea y 100 líneas por pedido.
- Dirección nueva: calle, ciudad y coordenadas obligatorias, con límites de rango.
- Identificación del comprador: RUC o cédula con dígito verificador válido.

## Facturación dentro del pedido

`OrderItem` guarda lo necesario para reconstruir la factura meses después:

| Campo | Para qué |
|---|---|
| `price` | Precio unitario cobrado (con descuento) |
| `listPrice` | Precio de catálogo, para calcular el descuento |
| `discountPct` | Descuento aplicado |
| `ivaRate` | Tarifa de IVA en el momento de la venta |

La factura deriva el descuento de `listPrice - price`, así que el total fiscal no
puede descuadrar del comercial. Antes se guardaba solo `price` y el XML
declaraba descuento cero.

## Pruebas

```bash
npm test                                  # 100 unitarias
npm run test:e2e                          # 62 comprobaciones contra PostgreSQL
```

| Archivo | Qué cubre |
|---|---|
| `tests/precios.test.js` | Cliente vs servidor, pasos de venta, descripciones |
| `tests/delivery.test.js` | Fechas, días de entrega, capacidad, antelación |
| `tests/e2e-compra.mjs` | Sobreventa, stock, numeración, totales reales |
| `tests/e2e-facturacion.mjs` | XML, claves de acceso, reconciliación |

`e2e-compra.mjs` incluye las pruebas de concurrencia que no pueden simularse con
mocks: cuatro pedidos simultáneos sobre una plaza, seis pedidos sobre las últimas
unidades, y cincuenta códigos a la vez.