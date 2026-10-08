<template>
  <div class="product-card" :class="{ 'is-featured': product.featured, 'is-outofstock': isOutOfStock }">
    <router-link :to="`/producto/${product.slug}`" class="product-link">
      <div class="product-img">
        <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" loading="lazy" />
        <span v-else class="product-fallback">{{ product.name[0] }}</span>
        <span v-if="product.featured" class="featured-badge">★ Destacado</span>
        <span v-if="hasDiscount" class="discount-badge">{{ discount }}%</span>
        <span v-if="isOutOfStock" class="outofstock-badge">Sin stock</span>
        <span v-else-if="lowStock" class="lowstock-badge">Últimas {{ formatQty(lowStock) }}</span>
      </div>
      <div class="product-body">
        <h3 class="product-name">{{ product.name }}</h3>
        <!--
          A granel se vende por bandejas enteras. La tarjeta lo dice de forma
          explícita para que nadie pida "635 g" esperando que se lo lleven: la
          unidad de venta es la bandeja.
        -->
        <p class="product-unit">
          <template v-if="isBulk">Por {{ bulkVenta }} de {{ formatQty(product.minQuantity) }} {{ unitLabel }}</template>
          <template v-else>
            {{ unitLabel }}<span v-if="product.presentation"> · {{ product.presentation }}</span>
          </template>
        </p>
        <p v-if="product.presentation && !isBulk" class="product-presentation">{{ product.presentation }}</p>
        <div class="product-price-row">
          <p class="product-price">{{ money(finalPrice) }} <small class="price-suffix">/ {{ unitLabel }}</small></p>
          <p v-if="hasDiscount" class="product-old-price">{{ money(product.price) }}</p>
        </div>
        <!--
          El precio del catálogo ya incluye IVA y así se cobra en el servidor, pero
          no se decía. En Ecuador el precio mostrado al consumidor debe ser el
          final: decirlo evita la discrepancia en caja y la llamada de reclamo.
        -->
        <p v-if="hasDiscount" class="savings">Ahorras {{ money(savings) }} ({{ discount }}%)</p>
        <p class="iva-note">IVA incluido</p>
      </div>
    </router-link>
    <button class="add-btn" :disabled="storeClosed() || isOutOfStock" @click="addToCart" aria-label="Agregar al carrito">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCartStore } from '../stores/cart.js'
import { useSettingsStore } from '../stores/settings.js'
import { money, discountedPrice } from '../utils/format.js'

const props = defineProps({ product: { type: Object, required: true } })
const cart = useCartStore()
const settings = useSettingsStore()

const discount = computed(() => Number(props.product.discount) || 0)
const hasDiscount = computed(() => discount.value > 0 && discount.value < 100)
const finalPrice = computed(() => discountedPrice(props.product.price, props.product.discount))
const savings = computed(() => Math.max(0, (Number(props.product.price) || 0) - finalPrice.value))
const isOutOfStock = computed(() => Number(props.product.stock) === 0)
/** Stock limitado y casi agotado: urges a decidir antes de que se acabe. */
const lowStock = computed(() => {
  const s = Number(props.product.stock)
  if (!Number.isFinite(s) || s <= 0) return 0
  return s <= 10 ? s : 0
})
/** A granel: el peso del empaque es el mínimo y se mide en gramos o kilos. */
const isBulk = computed(() => {
  const u = (props.product.unit || '').toLowerCase()
  return ['gramos', 'g', 'gramo', 'kilo', 'kg', 'kilogramo', 'libra', 'lb'].includes(u)
})
const unitLabel = computed(() => {
  const u = (props.product.unit || '').toLowerCase()
  if (u === 'kilo' || u === 'kg' || u === 'kilogramo') return 'kg'
  if (u === 'gramos' || u === 'g' || u === 'gramo') return 'g'
  if (u === 'libra' || u === 'lb') return 'lb'
  return props.product.unit
})
/** Cómo llama la tienda al empaque: "caja de plástico", "funda", "bandeja". */
const bulkVenta = computed(() => {
  const p = (props.product.presentation || '').trim()
  if (!p) return 'bandeja'
  // En minúscula porque va dentro de una frase: "Por caja de plástico de…".
  return p.charAt(0).toLowerCase() + p.slice(1)
})
function formatQty(v) {
  const n = Number(v)
  return Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/,'')
}

const storeClosed = () => settings.settings ? settings.settings.storeOpen === false : false

function addToCart() {
  if (storeClosed() || isOutOfStock.value) return
  cart.add(props.product)
}
</script>

<style scoped>
.product-card {
  position: relative;
  background: white;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: var(--transition);
}

.product-card.is-featured {
  border-color: var(--green-light);
}

.product-card.is-outofstock .product-img img {
  opacity: 0.55;
  filter: grayscale(0.3);
}

.product-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.product-link {
  display: block;
}

.product-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gray-light);
  overflow: hidden;
  position: relative;
}

.featured-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background: #ffd400;
  color: #5a4a00;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 50px;
  box-shadow: var(--shadow);
}

.discount-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--red);
  color: white;
  font-size: 0.78rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
}

.outofstock-badge {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(220, 53, 69, 0.95);
  color: white;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 5px 12px;
  border-radius: 50px;
  box-shadow: var(--shadow);
  letter-spacing: 0.3px;
}

.lowstock-badge {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(255, 167, 38, 0.95);
  color: #3e2000;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 5px 12px;
  border-radius: 50px;
  box-shadow: var(--shadow);
  letter-spacing: 0.3px;
}

.savings {
  font-size: 0.76rem;
  font-weight: 700;
  color: #2e7d32;
  margin-top: 3px;
}

.iva-note {
  font-size: 0.7rem;
  color: var(--gray);
  margin-top: 3px;
}

.product-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-fallback {
  font-size: 2.6rem;
  font-weight: 900;
  color: var(--green-light);
}

.product-body {
  padding: 14px 16px 18px;
}

.product-name {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--dark);
  line-height: 1.3;
  margin-bottom: 2px;
}

.product-unit {
  font-size: 0.78rem;
  color: var(--gray);
  margin-bottom: 2px;
}

.product-presentation {
  font-size: 0.72rem;
  color: var(--gray);
  margin-bottom: 6px;
  font-style: italic;
}

.price-suffix {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--gray);
}

.product-price {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--green-dark);
}

.product-price-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.product-old-price {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--gray);
  text-decoration: line-through;
}

.add-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--secondary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
  box-shadow: var(--shadow);
}

.add-btn:hover {
  background: var(--secondary-light);
  transform: scale(1.08);
}

.add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
