<template>
  <div class="page product-page">
    <div class="container">
      <div v-if="loading" class="spinner"></div>
      <div v-else-if="product" class="product-layout">
        <div class="product-img-box">
          <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" />
          <span v-else class="product-fallback">{{ product.name[0] }}</span>
          <span v-if="isOutOfStock" class="outofstock-badge-detail">Sin stock</span>
        </div>
        <div class="product-info">
          <router-link v-if="product.category" :to="{ name: 'home', query: { category: product.category.slug } }" class="product-category">
            {{ product.category.name }}
          </router-link>
          <h1>{{ product.name }}</h1>
          <p class="product-unit">
            Unidad: {{ product.unit }}
            <span v-if="product.presentation"> · {{ product.presentation }}</span>
            <span v-if="product.minQuantity"> · Mínimo {{ formatQty(product.minQuantity) }} {{ unitLabel }}</span>
          </p>
          <p v-if="product.presentation" class="product-presentation">Empaque: {{ product.presentation }}</p>
          <p v-if="product.description" class="product-desc">{{ product.description }}</p>
          <p class="product-price">
            {{ money(finalPrice) }} <small class="price-suffix">/ {{ unitLabel }}</small>
            <span v-if="hasDiscount" class="product-old-price">{{ money(product.price) }}</span>
            <span v-if="product.discount && product.discount < 100" class="product-discount">{{ product.discount }}%</span>
          </p>
          <p class="muted price-detail">
            <template v-if="esAGranel">
              Precio por {{ unitLabel }} · se vende por {{ pluralPresentacion }} de {{ formatQty(minQty) }} {{ unitLabel }}
            </template>
            <template v-else>
              Precio por {{ unitLabel }} · Mínimo {{ formatQty(minQty) }} {{ unitLabel }}<span v-if="stepQty !== minQty"> · incrementos de {{ formatQty(stepQty) }} {{ unitLabel }}</span>
            </template>
          </p>

          <p v-if="isOutOfStock" class="error-msg" style="margin-bottom:12px;font-weight:700">Producto sin stock — no disponible para agregar al carrito</p>

          <div class="purchase-row">
            <!--
              A granel el cliente elige bandejas enteras, no gramos: 1, 2 o 3.
              Es lo que se pesa en el mostrador, así que un selector de unidades
              es más claro que un campo de gramos que habría que multiplicar a
              mano. El campo numérico queda para el resto de productos.
            -->
            <div v-if="esAGranel" class="bandeja-picker">
              <button
                class="btn btn-outline btn-sm"
                :disabled="isOutOfStock || bandejas <= 1"
                @click="cambiarBandejas(-1)"
              >
                −
              </button>
              <div class="bandeja-valor">
                <strong>{{ formatBandejas(bandejas) }}</strong>
                <small>{{ pluralBandejas }}</small>
              </div>
              <button
                class="btn btn-outline btn-sm"
                :disabled="isOutOfStock"
                @click="cambiarBandejas(1)"
              >
                +
              </button>
            </div>

            <div v-else class="qty-box">
              <button @click="decQty" :disabled="isOutOfStock">−</button>
              <input
                v-model.number="qty"
                type="number"
                :min="minQty"
                :step="stepQty"
                :disabled="isOutOfStock"
                @change="normalizarQty"
                @blur="normalizarQty"
              />
              <button @click="incQty" :disabled="isOutOfStock">+</button>
            </div>

            <span class="qty-hint">
              {{ formatQty(qty) }} {{ unitLabel }} · {{ money(lineTotal) }}
            </span>

            <button class="btn btn-secondary" :disabled="isOutOfStock || !qtyValido" @click="add">
              {{ isOutOfStock ? 'Sin stock' : 'Agregar al carrito' }}
            </button>
          </div>

          <p v-if="esAGranel && !isOutOfStock" class="bulk-note">
            No hay fracciones: se pesa {{ pluralPresentacion }} enter{{ formatBandejas(bandejas) === '1' ? 'a' : 'as' }}.
          </p>
          <p v-if="!isOutOfStock && !qtyValido" class="error-msg">
            El mínimo es {{ formatQty(minQty) }} {{ unitLabel }}
          </p>
          <p v-else-if="!isOutOfStock && !pasoValido" class="error-msg">
            Esa cantidad no se puede preparar: se vende en pasos de {{ formatQty(stepQty) }} {{ unitLabel }}.
          </p>
          <p v-if="added" class="added-note">✓ Agregado al carrito</p>
        </div>
      </div>
      <div v-else class="empty-state">
        <h3>Producto no encontrado</h3>
        <router-link to="/" class="btn btn-primary">Volver a la tienda</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import { useCartStore } from '../stores/cart.js'
import { money, discountedPrice } from '../utils/format.js'

const route = useRoute()
const cart = useCartStore()
const product = ref(null)
const loading = ref(true)
const qty = ref(1)
const added = ref(false)

const finalPrice = computed(() => discountedPrice(product.value?.price, product.value?.discount))
const hasDiscount = computed(() => Number(product.value?.discount) > 0 && Number(product.value?.discount) < 100)
const isOutOfStock = computed(() => product.value != null && Number(product.value.stock) === 0)
const minQty = computed(() => Number(product.value?.minQuantity) || 1)
const stepQty = computed(() => Number(product.value?.stepQuantity) || 1)
/** A granel: el peso del empaque es lo que se vende, en bandejas enteras. */
const esAGranel = computed(() => {
  const u = (product.value?.unit || '').toLowerCase()
  return ['gramos', 'g', 'gramo', 'kilo', 'kg', 'kilogramo', 'libra', 'lb'].includes(u)
})
/** Cuántas bandejas equivalen a la cantidad actual. */
const bandejas = computed(() => {
  if (!esAGranel.value || minQty.value <= 0) return null
  return Math.round((Number(qty.value) || 0) / minQty.value * 100) / 100
})
const unitLabel = computed(() => {
  const u = (product.value?.unit || '').toLowerCase()
  if (u === 'kilo' || u === 'kg' || u === 'kilogramo') return 'kg'
  if (u === 'gramos' || u === 'g' || u === 'gramo') return 'g'
  if (u === 'libra' || u === 'lb') return 'lb'
  return product.value?.unit || ''
})
/** Total de la línea, para que el cliente vea el efecto de la cantidad antes de agregar. */
const lineTotal = computed(() => Math.round(finalPrice.value * (Number(qty.value) || 0) * 100) / 100)

const qtyValido = computed(() => {
  const n = Number(qty.value)
  return Number.isFinite(n) && n >= minQty.value - 1e-9
})
/** El servidor exige múltiplos del paso. Avisarlo aquí evita llegar al checkout y fallar. */
const pasoValido = computed(() => {
  const n = Number(qty.value)
  if (!Number.isFinite(n) || stepQty.value <= 0) return true
  const pasos = n / stepQty.value
  return Math.abs(pasos - Math.round(pasos)) < 1e-6
})

function formatQty(v) {
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}
function incQty() {
  qty.value = Math.round((Number(qty.value) + stepQty.value) * 100) / 100
}
function decQty() {
  const next = Math.round((Number(qty.value) - stepQty.value) * 100) / 100
  qty.value = Math.max(minQty.value, next)
}

/** Añade o quita una bandeja entera. Nunca baja de una. */
function cambiarBandejas(delta) {
  const actual = Math.round((Number(qty.value) || 0) / minQty.value)
  const siguiente = Math.max(1, actual + delta)
  qty.value = Math.round(siguiente * minQty.value * 100) / 100
}

function formatBandejas(n) {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '')
}
const pluralBandejas = computed(() => {
  const n = Math.round(Number(bandejas.value) || 1)
  return n === 1 ? 'bandeja' : 'bandejas'
})
/** Cómo llama la tienda a la unidad de venta: "bandeja", "caja", "funda"… */
const pluralPresentacion = computed(() => {
  const p = (product.value?.presentation || '').trim().toLowerCase()
  if (p) return p
  return esAGranel.value ? 'bandejas' : 'unidades'
})
/**
 * Ajusta lo que el cliente escribió a un múltiplo del paso hacia arriba.
 *
 * A granel el paso es la bandeja, así que 635 g con bandeja de 400 se guarda
 * como 800: dos bandejas. Nunca hacia abajo, porque podría quedarle corto.
 */
function normalizarQty() {
  const n = Number(qty.value)
  if (!Number.isFinite(n) || n < minQty.value) {
    qty.value = minQty.value
    return
  }
  const pasos = Math.ceil((n - minQty.value) / stepQty.value)
  qty.value = Math.round((minQty.value + pasos * stepQty.value) * 100) / 100
}

async function load() {
  loading.value = true
  product.value = null
  try {
    const data = await api.get(`/api/catalog/products/${route.params.slug}`)
    product.value = data.product
    // Arranca en el mínimo, que a granel es una bandeja entera y siempre es una
    // cantidad comprable.
    qty.value = primeraCantidadValida()
  } finally {
    loading.value = false
  }
}

/** Cantidad con la que arranca el selector: el mínimo, siempre comprable. */
function primeraCantidadValida() {
  return Math.round((Number(product.value?.minQuantity) || 1) * 100) / 100
}

function add() {
  if (isOutOfStock.value) return
  normalizarQty()
  if (!qtyValido.value || !pasoValido.value) return
  const ok = cart.add(product.value, qty.value)
  if (!ok) return
  added.value = true
  setTimeout(() => (added.value = false), 2000)
}

watch(() => route.params.slug, load)
onMounted(load)
</script>

<style scoped>
.product-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: start;
}

.product-img-box {
  aspect-ratio: 1 / 1;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--gray-light);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.outofstock-badge-detail {
  position: absolute;
  bottom: 14px;
  left: 14px;
  background: rgba(220, 53, 69, 0.95);
  color: white;
  font-size: 0.8rem;
  font-weight: 800;
  padding: 6px 14px;
  border-radius: 50px;
  box-shadow: var(--shadow);
}

.product-img-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-fallback {
  font-size: 6rem;
  font-weight: 900;
  color: var(--green-light);
}

.product-category {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--green-mid);
  background: var(--gray-light);
  padding: 5px 14px;
  border-radius: 50px;
  margin-bottom: 10px;
}

.product-info h1 {
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 800;
  color: var(--dark);
  margin-bottom: 4px;
}

.product-unit {
  color: var(--gray);
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.product-desc {
  color: var(--dark);
  margin-bottom: 16px;
}

.price-detail {
  margin-bottom: 12px;
  font-size: 0.85rem;
}

.product-price {
  font-size: 2rem;
  font-weight: 900;
  color: var(--green-dark);
  margin-bottom: 20px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.product-old-price {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--gray);
  text-decoration: line-through;
}

.product-discount {
  font-size: 0.85rem;
  font-weight: 800;
  color: white;
  background: var(--red);
  padding: 4px 12px;
  border-radius: 50px;
}

.purchase-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.qty-box {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--gray-mid);
  border-radius: 50px;
  overflow: hidden;
}

/*
  Selector de bandejas. Muestra el número grande de bandejas y el peso debajo,
  que es como se lee en el mostrador: "2 bandejas / 800 g".
*/
.bandeja-picker {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bandeja-picker button {
  min-width: 44px;
  height: 46px;
  border: 1.5px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  background: white;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--green-dark);
}

.bandeja-picker button:hover:not(:disabled) {
  border-color: var(--green-light);
  background: var(--gray-light);
}

.bandeja-picker button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bandeja-valor {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 84px;
  line-height: 1.15;
}

.bandeja-valor strong {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--green-dark);
}

.bandeja-valor small {
  font-size: 0.72rem;
  color: var(--gray);
  text-transform: lowercase;
}

.bulk-note {
  font-size: 0.82rem;
  color: var(--gray);
  margin-top: 10px;
}

.qty-box button {
  width: 42px;
  height: 46px;
  border: none;
  background: none;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--green-dark);
}

.qty-box input {
  width: 46px;
  text-align: center;
  border: none;
  border-left: 1.5px solid var(--gray-mid);
  border-right: 1.5px solid var(--gray-mid);
  height: 46px;
  font-size: 1rem;
  font-weight: 700;
  outline: none;
  -moz-appearance: textfield;
}

.qty-box input::-webkit-outer-spin-button,
.qty-box input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.added-note {
  margin-top: 12px;
  color: var(--green-mid);
  font-weight: 600;
}

@media (max-width: 768px) {
  .product-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .purchase-row {
    flex-direction: column;
    align-items: stretch;
  }

  .qty-box {
    justify-content: center;
  }
}
</style>
