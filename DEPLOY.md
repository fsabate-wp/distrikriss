# Despliegue

**Pushear a `main` no despliega nada.** No hay integracion continua en este
repositorio: el servidor y la web se construyen y se despliegan a mano. Un commit
en GitHub no cambia lo que los clientes ven hasta que se reconstruyen las
imagenes.

Este archivo existe porque esa confusion ya cuesta un bug: un arreglo estaba en
GitHub y seguia sin verse en la tienda.

## Que hay que reconstruir

El commit `ff1e939` (precio de la bandeja) necesita **las dos imagenes**:

| Imagen | Por que |
|---|---|
| `server` | El precio se reparte en el servidor, y la migracion `20261008120000_order_item_precio_por_unidad` cambia `OrderItem.price` a `DECIMAL(16,6)` |
| `app` | El carrito divide el precio por la unidad minima y guarda `salePrice` |

Si solo se reconstruye la web, el cliente manda la cantidad correcta pero el
servidor cobra el precio de lista. Si solo se reconstruye el servidor, el
servidor cobra bien pero la web sigue multiplicando por los gramos.

El `entrypoint.sh` del servidor aplica las migraciones solo al arrancar, asi que
la reconstruccion del servidor basta para `prisma migrate deploy`.

## Como comprobar que quedo desplegado

La migracion es lo primero que falla si se olvida. Consultar:

```sql
SELECT numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'OrderItem' AND column_name = 'price';
```

Tiene que dar `16` y `6`. Si sale `10` y `2`, el servidor va con el codigo viejo
y va a cobrar de mas.

Despues, un producto de bandejas (por ejemplo `$1` con minimo `400`):

- La tarjeta debe decir **"$1 por 400 g"**, no "$1 / g".
- Al agregar, el carrito debe mostrar **$1**, no $400.

## Por que antes no se veian los cambios

El service worker cacheaba el bundle. Con `registerType: 'autoUpdate'` pero
registro manual (`injectRegister: false`), el worker nuevo se instalaba y se
quedaba **esperando a que se cerraran todas las pestanas**. Con el navegador
abierto, el cliente seguía con el JavaScript viejo.

Ahora `main.js` manda `SKIP_WAITING` y recarga cuando el worker nuevo toma el
control, asi que un despliegue se aplica en la siguiente carga.

Aun asi, si una pestana lleva mucho tiempo abierta, conviene recarga una vez a
mano para descartar el bundle antiguo.

## Cache de la API

`/api/catalog/**` va con `NetworkOnly`: el precio lo decide el servidor y un
catalogo de la cache puede enseñar una cifra que ya cambio. El resto de la API
se cachea 60 segundos, solo por `GET` y nunca `/api/auth`.