<template>
  <div class="drawer-overlay" :class="{ open }" @click="$emit('close')">
    <aside class="drawer" :class="{ open }" @click.stop>
      <div class="drawer-header">
        <h3>Tu carrito</h3>
        <button class="close-btn" @click="$emit('close')" aria-label="Cerrar carrito">✕</button>
      </div>

      <div class="drawer-body">
        <div v-if="cart.items.length === 0" class="empty-state">
          <h3>Tu carrito está vacío</h3>
          <p>Agrega productos de la tienda</p>
          <button class="btn btn-outline back-btn" @click="goHome">← Volver a la tienda</button>
        </div>

        <div v-else class="cart-items">
          <div v-for="item in cart.items" :key="item.productId" class="cart-item">
            <div class="cart-item-img">
              <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.name" />
              <span v-else class="item-fallback">{{ item.name[0] }}</span>
            </div>
            <div class="cart-item-info">
              <p class="cart-item-name">{{ item.name }}</p>
              <!--
                El precio que se muestra es el del empaque, que es como lo fija
                el tendero. `item.price` es el precio por gramo y solo sirve para
                multiplicar por la cantidad: enseñarlo daría $0.00.
              -->
              <p class="cart-item-meta">
                {{ money(precioVentaDe(item)) }}
                <span v-if="esVentaPorEmpaque(item)">por {{ formatQty(item.minQuantity) }} {{ item.unit }}</span>
                <span v-else>/ {{ item.unit }}</span>
                <span v-if="item.presentation"> · {{ item.presentation }}</span>
              </p>
              <!--
                Lo que el cliente compró son cajas, no gramos. "800 Gramos" es lo
                mismo que "2 cajas" pero suena a 800 piezas sueltas.
              -->
              <p class="cart-item-cant">
                {{ cantidadDe(item).principal }}
                <small v-if="cantidadDe(item).detalle">{{ cantidadDe(item).detalle }}</small>
              </p>
              <div class="qty-control">
                <button
                  class="qty-step"
                  :aria-label="`Quitar una ${nombreDe(item)}`"
                  :title="`Quitar una ${nombreDe(item)}`"
                  @click="cart.decrement(item.productId)"
                >
                  −
                </button>
                <button
                  class="qty-step qty-add"
                  :aria-label="`Añadir una ${nombreDe(item)}`"
                  :title="`Añadir una ${nombreDe(item)}`"
                  @click="cart.increment(item.productId)"
                >
                  <span aria-hidden="true">+</span> {{ nombreDe(item) }}
                </button>
              </div>
            </div>
            <div class="cart-item-right">
              <button class="remove-btn" @click="cart.remove(item.productId)" aria-label="Quitar">✕</button>
              <p class="cart-item-total">{{ money(item.price * item.quantity) }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="cart.items.length > 0" class="drawer-footer">
        <div class="cart-summary">
          <span>Subtotal <small class="summary-iva">IVA incluido</small></span>
          <strong>{{ money(cart.subtotal) }}</strong>
        </div>

        <!--
          Aviso del pedido mínimo en el carrito, no solo al final del checkout.
          Decirle cuánto falta y por cuánto puede completarlo sube el ticket medio
          sin cambiar nada del proceso: el mismo cliente va a seguir comprando,
          solo que más cosas.
        -->
        <div v-if="minOrder > 0" class="min-order" :class="{ 'is-met': faltaMinimo <= 0 }">
          <template v-if="faltaMinimo > 0">
            <div class="min-order-bar">
              <div class="min-order-fill" :style="{ width: minProgress + '%' }"></div>
            </div>
            <p class="min-order-text">
              Te faltan <strong>{{ money(faltaMinimo) }}</strong> para alcanzar el mínimo de pedido
            </p>
          </template>
          <p v-else class="min-order-text done">
            ¡Alcanzaste el mínimo de pedido!
          </p>
        </div>

        <router-link v-if="!auth.isAuthed" to="/registro" class="btn btn-primary btn-block" @click="$emit('close')">
          Regístrate para continuar
        </router-link>
        <router-link v-else to="/checkout" class="btn btn-primary btn-block" @click="$emit('close')">
          Ir al checkout
        </router-link>
        <button class="btn btn-outline btn-block back-btn" @click="goHome">← Volver a la tienda</button>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart.js'
import { useAuthStore } from '../stores/auth.js'
import { useSettingsStore } from '../stores/settings.js'
import { computed } from 'vue'
import { money, unidadesDeVenta, descripcionCantidad, nombreUnidadVenta } from '../utils/format.js'

function formatQty(v) {
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Precio que se le enseña al cliente: el de la bandeja, nunca el precio por
 * gramo. Los carritos guardados antes del cambio no traen `salePrice`, así que
 * se reconstruye desde el precio por unidad.
 */
function precioVentaDe(item) {
  if (item.salePrice != null) return Number(item.salePrice)
  return Number(item.price || 0) * unidadesDeVenta(item.minQuantity)
}

/** ¿El producto se vende por empaque (caja, funda, bandeja) y no por unidad? */
function esVentaPorEmpaque(item) {
  return unidadesDeVenta(item.minQuantity) > 1
}

/** "2 cajas", con los 800 gramos como dato secundario. */
function cantidadDe(item) {
  return descripcionCantidad({
    quantity: item.quantity,
    minQuantity: item.minQuantity,
    presentation: item.presentation,
    unit: item.unit,
  })
}

/** Nombre en singular, para los botones: "Añadir una caja". */
function nombreDe(item) {
  return esVentaPorEmpaque(item)
    ? nombreUnidadVenta(item.presentation, item.unit)
    : (item.unit || 'unidad').toLowerCase()
}

defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const cart = useCartStore()
const auth = useAuthStore()
const settings = useSettingsStore()
const router = useRouter()

/**
 * Mínimo de pedido vigente.
 *
 * Cada zona de cobertura puede tener el suyo, y el del carrito es el de la zona
 * elegida. Si la tienda no tiene mínimo configurado (0), no se muestra nada.
 */
const minOrder = computed(() => {
  const s = settings.settings
  if (!s) return 0
  const min = Number(s.minOrderAmount)
  return Number.isFinite(min) && min > 0 ? min : 0
})

const faltaMinimo = computed(() => Math.max(0, Math.round((minOrder.value - cart.subtotal) * 100) / 100))

const minProgress = computed(() => {
  if (minOrder.value <= 0) return 0
  return Math.min(100, Math.round((cart.subtotal / minOrder.value) * 100))
})

function goHome() {
  router.push({ name: 'home' })
  emit('close')
}
</script>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  z-index: 1100;
}

.drawer-overlay.open {
  opacity: 1;
  pointer-events: all;
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 92vw;
  background: var(--white);
  box-shadow: var(--shadow-lg);
  transform: translateX(100%);
  transition: transform 0.3s ease;
  display: flex;
  flex-direction: column;
  z-index: 1101;
}

.drawer.open {
  transform: translateX(0);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--gray-mid);
}

.drawer-header h3 {
  font-size: 1.15rem;
  color: var(--dark);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: var(--gray);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.cart-items {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cart-item {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 12px;
  background: var(--gray-light);
  border-radius: var(--radius-sm);
}

.cart-item-img {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--green-light);
  color: white;
}

.cart-item-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-fallback {
  font-size: 1.4rem;
  font-weight: 800;
}

.cart-item-info {
  flex: 1;
}

.cart-item-name {
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--dark);
}

.cart-item-meta {
  font-size: 0.78rem;
  color: var(--gray);
}

.qty-control {
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  margin-top: 8px;
}

/*
  Los dos botones son de la MISMA altura y el signo va con el mismo tamaño: antes
  el "+ caja" salía con tipografía más pequeña y el "+" se veía diminuto al lado
  del "−", que parecía un botón y el otro una etiqueta.

  El de quitar es cuadrado y el de añadir lleva texto, porque no basta con "+":
  hay que decir QUÉ se añade, o nadie sabe si suma un gramo o una caja.
*/
.qty-control button {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gray-mid);
  background: var(--gray-light);
  color: var(--green-dark);
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.qty-control button:hover {
  background: white;
  border-color: var(--green-light);
}

.qty-control button:active {
  background: var(--green-mid);
  color: white;
}

.qty-control .qty-step {
  width: 32px;
  font-size: 1.1rem;
  border-radius: 8px 0 0 8px;
}

.qty-control .qty-add {
  padding: 0 12px;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 0 8px 8px 0;
  border-left: none;
  white-space: nowrap;
}

.qty-control .qty-add span {
  font-size: 1.1rem;
  line-height: 1;
}

.cart-item-cant {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--dark);
  margin-top: 2px;
}

.cart-item-cant small {
  font-weight: 400;
  color: var(--gray);
  margin-left: 6px;
}

.cart-item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.remove-btn {
  background: none;
  border: none;
  color: var(--gray);
  font-size: 0.85rem;
}

.cart-item-total {
  font-weight: 800;
  color: var(--green-dark);
}

.drawer-footer {
  border-top: 1px solid var(--gray-mid);
  padding: 20px 24px;
}

.cart-summary {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
  font-weight: 600;
}

.cart-summary strong {
  font-size: 1.1rem;
  color: var(--green-dark);
}

.summary-iva {
  font-weight: 400;
  font-size: 0.72rem;
  color: var(--gray);
}

.min-order {
  margin-bottom: 14px;
}

.min-order-bar {
  height: 6px;
  background: var(--gray-mid);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 6px;
}

.min-order-fill {
  height: 100%;
  background: var(--green-mid);
  border-radius: 999px;
  transition: width 0.35s ease;
}

.min-order-text {
  font-size: 0.82rem;
  color: var(--dark);
}

.min-order-text.done {
  color: var(--green-mid);
  font-weight: 700;
}

.back-btn {
  margin-top: 10px;
}
</style>
