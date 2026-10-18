# Facturación electrónica (SRI)

## Cómo funciona

El comprobante se emite **cuando el pago se confirma**, no al crear el pedido:

- **Transferencia**: cuando el administrador marca el pago como `PAID`.
- **Contra reembolso**: cuando el pedido pasa a `DELIVERED`.

El motivo es legal, no técnico: una factura electrónica documenta una operación
ejecutada. Emitirla al recibir el pedido generaba comprobantes de ventas que
aún no se habían cobrado.

## Flujo de una factura

```
prepareInvoice  →  toma el secuencial, construye el XML, lo guarda como DRAFT
submitInvoice   →  firma, envía al SRI, espera la autorización
jobs.js         →  reintenta lo que quedó a medias y avisa al panel
```

Cada paso guarda el resultado y su motivo en `InvoiceEvent`, que es el
historial auditable del comprobante.

## Estado del comprobante

| Estado | Significado |
|---|---|
| `DRAFT` | XML generado, todavía sin firmar |
| `SIGNED` | Firmado, enviándose |
| `RECEIVED` | El SRI lo recibió, falta su respuesta |
| `AUTHORIZED` | Autorizado. Es el único estado con validez fiscal |
| `NOT_AUTHORIZED` | El SRI lo rechazó tras recibirlo |
| `REJECTED` | El SRI no lo aceptó en recepción |
| `FAILED` | Error de red o de servicio, reintentable |
| `NO_CERTIFICATE` | El certificado no se pudo leer o no coincide el RUC |
| `CREDITED` | Anulado por una nota de crédito |

Solo `RECEIVED`, `SIGNED` y `FAILED` se reintentan solos. Los demás ya tienen
respuesta definitiva del SRI y reenviar produce el mismo resultado.

El worker también recupera los comprobantes que quedan en esos estados **sin
`nextRetryAt`**: son los que quedaron huérfanos si el proceso murió justo después
de firmar o de recibir, antes de fijar el próximo reintento (un despliegue a
mitad de envío). Antes eran invisibles para el worker, porque `nextRetryAt <=
ahora` no incluye `NULL`.

## Anulación

Una factura autorizada **no se puede borrar ni cancelar**. La única vía legal es
emitir una nota de crédito (`NOTA_CREDITO`, codDoc `07`) que la referencia:

```
POST /api/admin/invoices/:id/credit-note  { reason: "..." }
```

Cancelar un pedido cuya factura ya está autorizada se bloquea con un mensaje
que indica el número de comprobante y enlaza a la nota de crédito.

La nota se prepara con el **mismo importe** que la factura que anula: se
reconcilia contra el total del comprobante original y, si el pedido cambió
después de facturarse, no se emite. La factura pasa a `CREDITED` **solo cuando
el SRI autoriza la nota**; mientras tanto sigue `AUTHORIZED` (vigente), porque
una nota fallida no anula nada. Un comprobante admite una sola nota de crédito.

La nota es un comprobante **sin pedido propio** (`orderId` queda en `NULL`): el
pedido ya tiene su factura (`Invoice.orderId` es único), así que la nota se enlaza
al comprobante que anula por `creditedById`. Su RIDE se arma con el pedido de la
factura original.

## RIDE

La RIDE es lo que permite a una persona o empresa **deducir IVA**. Sin ella la
factura existe, pero no sirve para nada al comprador, así que el cliente tiene
su propia vía para obtenerla:

```
GET /api/orders/:id/invoice   →  datos del comprobante para verlo en la web
GET /api/orders/:id/ride      →  PDF con el QR de la CLAVEACCESO autorizada
```

Ambas filtran por `userId`: cada quien descarga la suya y un tercero recibe
`404`, no un `403` que confirmaría que el pedido existe.

| Situación | Respuesta |
|---|---|
| Pedido sin comprobante aún | `404` |
| Comprobante emitido, no autorizado | `409` con el estado real |
| Autorizado | `200`, PDF descargable |

Un PDF sin autorización **no se sirve**: un comprobante de prueba en manos de un
cliente es un problema legal. En su lugar, el cliente ve el estado y un mensaje
en lenguaje llano (`invoiceMessageFor` en `lib/sri/labels.js`).

`GET /api/admin/invoices/:id/ride` sigue existiendo para el panel.

La columna de cantidad de la RIDE se lee en cajas ("2 cajas") con los gramos
debajo ("800 g"), porque lo que se vendió fueron dos cajas. El tamaño sale del
snapshot de la línea del pedido, no del catálogo: el comprobante no cambia si
después agrandan la caja.

El dato de autorización vive en `Invoice.authorizationProof` (el campo
`comprobante` que devuelve el SRI). Es lo que se persiste en la RIDE.

## Firma (XAdES-BES)

El SRI **no acepta una firma XMLDSig a secas**: exige `XAdES_BES` (ETSI TS
101 903). Una firma enveloped normal la valida cualquier librería XMLDSig pero
el SRI la rechaza, y el fallo no aparece hasta emitir la primera factura real.

`lib/sri/xades.js` construye la firma completa con tres referencias —el
comprobante, `SignedProperties` y `KeyInfo`— y el certificado va **dos veces**:
dentro de `KeyInfo` y resumido en `SignedProperties` (`CertDigest` +
`IssuerSerial`), que es lo que impide sustituir el certificado firmante. Todo va
con **SHA-1** (digest y firma) y C14N 1.0 inclusiva; el SRI no admite SHA-256.

Los fragmentos que se firman por separado (`SignedInfo`, `KeyInfo`,
`SignedProperties`) declaran en su raíz los espacios de nombres que en el
documento final heredan de `ds:Signature`, antes de canonizarlos. Si no, el
resumen no coincidiría con el que calcula el validador del SRI.

## Certificados

- El `.p12` se sube por el panel y se guarda en `server/certificates/`.
- La contraseña se cifra con **AES-256-GCM** usando `SRI_CERT_SECRET` antes de
  guardarse. Nunca sale de la base de datos ni vuelve al panel.
- Al leer el certificado se comprueba, **antes de emitir**, que no esté vencido
  y que su RUC coincida con el configurado. Es la causa más frecuente de
  rechazo del SRI y así se detecta en el panel en lugar de días después.
- Si cambias el `.p12`, hay que volver a introducir la contraseña.

### Rotar `SRI_CERT_SECRET`

Cambiar la clave invalida la contraseña guardada. El panel detectará el fallo y
pedirá reintroducirla. Las facturas ya autorizadas no se ven afectadas.

## Configuración

| Variable | Para qué |
|---|---|
| `SRI_CERT_SECRET` | Clave de cifrado de la contraseña del certificado. **Obligatoria en producción** |
| `SRI_JOB_INTERVAL_MS` | Cada cuánto el worker pregunta al SRI (por defecto 30 s) |
| `SRI_AUTH_POLL_MS` | Intervalo entre consultas de una misma factura (4 s) |
| `SRI_AUTH_POLL_ATTEMPTS` | Consultas antes de devolver el trabajo a la cola (8) |
| `SRI_RETRY_BASE_MS` | Espera base del reintento, con retroceso exponencial (60 s) |
| `SRI_MAX_ATTEMPTS` | Intentos antes de dejar un comprobante en error permanente (12) |
| `SRI_SOAP_TIMEOUT_MS` | Tiempo máximo de espera al SRI (20 s) |

En producción el arranque **falla** si faltan `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `ADMIN_PASSWORD` o `SRI_CERT_SECRET`.

## IVA

Las tarifas admitidas son las del catálogo del SRI: **0, 2, 3, 4, 5, 10, 12,
14 y 15 %**. Una tarifa fuera de esa lista se rechaza al guardar el producto y
al emitir, en vez de caer a 15 % en silencio.

La tarifa global del negocio se toma tal cual: **0 % es una tarifa válida**, no
un "sin configurar". Solo un ajuste ausente o no numérico usa el 15 % por defecto.

El precio del catálogo se trata como **IVA incluido** y es el de la **unidad
mínima**: una bandeja de 400 g a $1 son $0.0025 por gramo. El descuento se
aplica en el servidor y `OrderItem.price` guarda el precio por unidad ya
descontado, con `listPrice` como referencia. La factura deriva el descuento de
esa diferencia, de modo que el total fiscal no puede descuadrar del comercial.
Detalle completo en README-COMPRA.md.

`precioUnitario` se emite con hasta 6 decimales. Redondearlo a 2 descuadra
`cantidad × precio unitario` frente a `precioTotalSinImpuesto` en venta a
granel, y el SRI rechaza el comprobante.

## Correlativo

`DocumentSeries` mantiene el número por `(tipo, establecimiento, punto)`. El
secuencial se incrementa con `INSERT ... ON CONFLICT ... RETURNING`, que es
atómico. Los índices únicos de `accessKey` y de la serie son la red de seguridad.

Una emisión nunca reutiliza un número: si algo falla después de tomar el
secuencial, ese número queda consumido y el comprobante se emite con el
siguiente. Es el comportamiento correcto, porque el SRI exige que la numeración
sea correlativa y sin huecos.

## Reconciliación

Antes de firmar se comprueba que el total del XML coincida con `Order.total`.
Si difieren, no se emite y el motivo queda registrado. Es preferible avisar a
que dejar un documento que el SRI aceptaría y que después no se podría
defender.

## Seguridad

- Cambiar el RUC, el ambiente o el certificado exige **volver a confirmar la
  contraseña** (`428 STEP_UP_REQUIRED`). `/sri/step-up` verifica la contraseña y
  emite un **ticket firmado** por el servidor (caduca en 10 minutos); es lo único
  que valida `requireStepUp`, así que un token robado no puede fabricarse la
  confirmación enviando una fecha y un nonce inventados.
- Las peticiones que usan cookies se validan contra `Origin` (protección CSRF).
- El panel nunca se cachea (`Cache-Control: no-store`).
- Hay límites de peticiones por IP en login, pedidos, pruebas del SRI,
  reintentos y subida de certificados.
- Cambios de configuración fiscal y issuance quedan en `AuditLog`.

## Pruebas

```bash
npm test                              # 185 pruebas unitarias
npm run test:e2e                      # comprobaciones contra PostgreSQL
node server/tests/preflight-sri.mjs   # alcance al SRI y formato de clave
```

`test:e2e` necesita la base de datos levantada (`docker compose -f
docker-compose.dev.yml up -d`) y las migraciones aplicadas.

`e2e-ecommerce.mjs` cubre las rutas del cliente: aislamiento entre usuarios en
la RIDE, los tres estados del comprobante y la descarga del PDF.


