# Proceso de compra

Recorrido completo desde que el cliente abre el producto hasta que el pedido
llega al panel. Documenta las reglas que el servidor aplica y por qué, para que
un cambio no rompa silenciosamente la coherencia entre lo que ve el cliente y lo
que se cobra.

## Reglas de precio

La regla vive en **`server/src/lib/precios.js`** y está replicada en
`apps/app/src/utils/format.js`. `tests/precios.test.js` recorre ~50.000
combinaciones de precio, descuento y mínimo comparando ambas copias: si
divergen, el carrito muestra una cifra y el pedido cobra otra.

| Concepto | Regla |
|---|---|
| Precio de catálogo | IVA incluido, y es el de la **unidad mínima** (la bandeja) |
| Descuento | 0–100 %, aplicado sobre el precio de lista |
| Precio por unidad de medida | `round6(precio × (1 - descuento/100) / minimo)` |
| Subtotal | Suma de líneas, con `round2` en cada una |
| Total | Subtotal + envío, redondeado a dos decimales |

### El precio es de la bandeja, no del gramo

El tendero fija el precio de lo mínimo que se puede comprar. Si los champiñones
están a $1 y la bandeja son 400 g, esos $1 son por los 400 g: **$0.0025 por
gramo**. Antes se multiplicaba `$1 × 400 g` y una sola bandeja salía a $400.

La regla es uniforme, sin mirar la unidad: el divisor es siempre `minQuantity`.
Con mínimo 1 no cambia nada (es el caso de los productos por kilo o por
unidad), y con mínimo 400 divide entre 400. Los productos de "Unidad" con
mínimo 4 o 6 del catálogo son fundas, no unidades sueltas, y también se cobran
por el empaque.

Por eso `OrderItem.price` guarda el precio **por unidad de medida**, no el de la
bandeja, y por eso la columna es `DECIMAL(16,6)`: con dos decimales, $0.0025 se
quedaría en $0.00 y el total de la línea se perdería. El redondeo a dinero se
hace sobre el total de la línea, nunca sobre ese valor intermedio.

El descuento se aplica **antes** de dividir. Al revés, el precio por gramo
guardado sería el de lista y el XML declararía un precio unitario que no es el
que se cobró.

En pantalla nunca se muestra el precio por gramo, que aparecería como $0.00. Se
anuncia el precio del empaque: "Por caja de plástico de 400 g".

### Stock

El stock comparte unidad con la cantidad: los 400 g de una bandeja se comparan
contra el número de stock. Si el tendero pone 10 y la bandeja son 400 g, el
producto queda invendible aunque haya existencias de sobra. Conviene documentar
en el panel que el stock va en la misma unidad que el mínimo.

El servidor **nunca** toma el precio del cliente: siempre lo lee del catálogo y
lo calcula. El carrito guarda un precio para mostrarlo, pero es informativo.

El precio que ve el cliente se acompaña siempre de **"IVA incluido"**, porque en
Ecuador el precio mostrado al consumidor es el final. Cuando hay descuento, se dice
también cuánto se ahorra: el dato ya estaba en la tarjeta, solo se tachaba.

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

El aviso de esta reconciliación se muestra **en amarillo, no como error**: el
pedido sigue siendo válido, es información que el cliente debe ver antes de
confirmar.

### Mínimo de pedido

`CartDrawer` muestra una barra de progreso con lo que falta para alcanzar
`Settings.minOrderAmount`. Avisar en el carrito, en lugar de solo al final del
checkout, sube el ticket medio sin cambiar nada del proceso: el mismo cliente
compra igual, solo que más cosas.

## Búsqueda

`GET /api/catalog/products?search=` resuelve lo que la gente escribe de verdad
en Ecuador: `papa`, `PAPA` y `pápá` encuentran el mismo producto.

- El filtrado usa SQL con `~*` y un patrón que cubre cada vocal con y sin tilde
  (`patronSql` en `server/src/lib/search.js`). `contains` de Prisma resuelve
  mayúsculas pero no tildes, que es justo el caso que más falla.
- Todo va parametrizado por `Prisma.sql`: el texto del usuario nunca se
  concatena en la consulta.
- Se exige que **todos** los términos aparezcan, y cada uno puede estar en el
  nombre, la descripción, la presentación o el SKU.
- El orden por defecto es **relevancia**: gana el nombre exacto, luego el
  prefijo, luego la coincidencia dentro del nombre. Es lo que espera quien
  escribe.
- Un término de una sola letra se descarta: devolvería medio catálogo.
- **Sin resultados se ofrecen alternativas** de la misma categoría, en lugar de
  una página muerta. Una búsqueda sin resultados es el final del embudo.

La coincidencia es por subcadena: "papa" encuentra "Papa amarilla", pero buscar
el plural "papas" de un producto llamado "Papa" no coincide. No se hace
 stemming ni sinónimos.

## Recompra: "pedir lo de siempre"

`GET /api/orders/repeat/last` devuelve los productos del último pedido en un
estado válido, con la cantidad que se pidió entonces. Para una tienda de
alimentación la recompra es la vía más barata a facturar.

Reglas:

- Solo considera pedidos `CONFIRMED`, `PREPARING`, `OUT_FOR_DELIVERY` o
  `DELIVERED`. Un pedido `CANCELLED` no es historial que haya que repetir.
- Filtra contra el catálogo actual: los productos desactivados no se ofrecen y
  se listan aparte en `missing`, para poder avisar.
- Informa el **precio vigente** (`currentPrice`) junto al del pedido anterior
  (`lastPrice`), y activa `priceChanged` si difieren. El precio que se cobra lo
  pone siempre el servidor.
- `stock` es el disponible real en ese momento. El cliente acota con él antes de
  añadir, porque entre la respuesta y el clic puede haber caído.

`cart.addMany` reintenta producto por producto con las mismas reglas de `add()`
(mínimo, paso, unidades) y devuelve `{ agregados, omitidos, priceChanged }`. Es
preferible volver a pedir la mitad de las cosas que no poder repetir nada.

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
| `price` | Precio por unidad de medida cobrado (con descuento) |
| `listPrice` | Precio de lista por unidad, para calcular el descuento |
| `discountPct` | Descuento aplicado |
| `ivaRate` | Tarifa de IVA en el momento de la venta |
| `unitQuantity` | Tamaño del empaque en ese momento (los 400 g de una caja) |
| `saleUnitName` | Cómo lo llamaba el tendero: "caja", "funda", "bandeja" |

La factura deriva el descuento de `listPrice - price`, así que el total fiscal no
puede descuadrar del comercial. Antes se guardaba solo `price` y el XML
declaraba descuento cero.

## El comprobante se lee en cajas

Lo que el cliente compró son cajas, no gramos. "800 Gramos" en un comprobante es
lo mismo que "2 cajas", pero suena a 800 piezas sueltas.

`unitQuantity` y `saleUnitName` se congelan en la línea del pedido porque el
tendero puede agrandar la caja después. Un comprobante ya autorizado tiene que
seguir diciendo "caja de 400 g" aunque ahora la caja sea de 500 g: los dos datos
quedan guardados en la línea que lo generó.

| Site | Cómo se lee |
|---|---|
| Detalle del pedido (cliente) | "2 cajas (800 g)" |
| Detalle del pedido (panel) | "2 cajas (800 g)" |
| RIDE en PDF | Columna CANT. en "2 cajas", con "800 g" debajo |
| XML del SRI | `cantidad` numérica 800; la descripción dice "(2 cajas de 400 gramos)" |

La cantidad del XML **no** cambia: para el SRI tiene que ser numérica y en la
unidad de medida, que es lo que usan el stock y la auditoría. La parte humana va
en la descripción, que es donde el SRI permite texto.

Las líneas creadas antes de esta columna no tienen el dato y siguen saliendo en
su unidad de medida, sin inventar un empaque.

## Pruebas

```bash
npm test                                  # 150 unitarias
npm run test:e2e                          # comprobaciones contra PostgreSQL
```

| Archivo | Qué cubre |
|---|---|
| `tests/precios.test.js` | Cliente vs servidor, pasos de venta, descripciones |
| `tests/delivery.test.js` | Fechas, días de entrega, capacidad, antelación |
| `tests/e2e-compra.mjs` | Sobreventa, stock, numeración, totales reales |
| `tests/e2e-facturacion.mjs` | XML, claves de acceso, reconciliación |
| `tests/e2e-geolocalizacion.mjs` | Zonas, polígonos, cobertura |
| `tests/e2e-ecommerce.mjs` | RIDE del cliente, aislamiento, recompra, búsqueda, precio por bandeja |
| `tests/http-geolocalizacion.mjs` | Endpoints de cobertura sobre HTTP |

`e2e-compra.mjs` incluye las pruebas de concurrencia que no pueden simularse con
mocks: cuatro pedidos simultáneos sobre una plaza, seis pedidos sobre las últimas
unidades, y cincuenta códigos a la vez.

`e2e-ecommerce.mjs` levanta el servidor real y verifica, entre otras cosas, que
un cliente no puede ver el comprobante de otro. Limpia al principio los datos
que dejaron corridas interrumpidas: las zonas se resuelven por polígono y una
zona vieja haría fallar el horario de la prueba.
