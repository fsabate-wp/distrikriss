<template>
  <div class="product-card" :class="{ 'is-featured': product.featured }">
    <router-link :to="`/producto/${product.slug}`" class="product-link">
      <div class="product-img">
        <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" loading="lazy" />
        <span v-else class="product-fallback">{{ product.name[0] }}</span>
        <span v-if="product.featured" class="featured-badge">★ Destacado</span>
        <span v-if="hasDiscount" class="discount-badge">{{ discount }}%</span>
      </div>
      <div class="product-body">
        <h3 class="product-name">{{ product.name }}</h3>
        <p class="product-unit">
          {{ product.unit }}
          <span v-if="product.minQuantity && Number(product.minQuantity) !== 1"> · desde {{ formatQty(product.minQuantity) }} {{ unitLabel }}</span>
          <span v-else-if="product.presentation"> · {{ product.presentation }}</span>
          <span v-else-if="product.unit.toLowerCase() === 'kilo'"> · mínimo 1 Kilo</span>
        </p>
        <p v-if="product.presentation" class="product-presentation">{{ product.presentation }}</p>
        <div class="product-price-row">
          <p class="product-price">{{ money(finalPrice) }} <small class="price-suffix">/ {{ unitLabel }}</small></p>
          <p v-if="hasDiscount" class="product-old-price">{{ money(product.price) }}</p>
        </div>
      </div>
    </router-link>
    <button class="add-btn" :disabled="storeClosed()" @click="addToCart" aria-label="Agregar al carrito">
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
const unitLabel = computed(() => {
  const u = (props.product.unit || '').toLowerCase()
  if (u === 'kilo') return 'kg'
  if (u === 'gramos') return 'g'
  return props.product.unit
})
function formatQty(v) {
  const n = Number(v)
  return Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/,'')
}

const storeClosed = () => settings.settings ? settings.settings.storeOpen === false : false

function addToCart() {
  if (storeClosed()) return
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
