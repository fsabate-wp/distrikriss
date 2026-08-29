<template>
  <div class="page product-page">
    <div class="container">
      <div v-if="loading" class="spinner"></div>
      <div v-else-if="product" class="product-layout">
        <div class="product-img-box">
          <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" />
          <span v-else class="product-fallback">{{ product.name[0] }}</span>
        </div>
        <div class="product-info">
          <router-link v-if="product.category" :to="{ name: 'home', query: { category: product.category.slug } }" class="product-category">
            {{ product.category.name }}
          </router-link>
          <h1>{{ product.name }}</h1>
          <p class="product-unit">
            Unidad: {{ product.unit }}
            <span v-if="product.presentation"> · {{ product.presentation }}</span>
            <span v-if="product.minQuantity"> · Mínimo {{ formatQty(product.minQuantity) }} {{ product.unit }}</span>
          </p>
          <p v-if="product.presentation" class="product-presentation">Empaque: {{ product.presentation }}</p>
          <p v-if="product.description" class="product-desc">{{ product.description }}</p>
          <p class="product-price">
            {{ money(finalPrice) }} <small class="price-suffix">/ {{ unitLabel }}</small>
            <span v-if="hasDiscount" class="product-old-price">{{ money(product.price) }}</span>
            <span v-if="product.discount && product.discount < 100" class="product-discount">{{ product.discount }}%</span>
          </p>
          <p class="muted" style="margin-bottom:12px;font-size:0.85rem">
            Precio por {{ unitLabel }} · Mínimo {{ formatQty(minQty) }} {{ product.unit }}<span v-if="stepQty !== minQty"> · incrementos de {{ formatQty(stepQty) }}</span>
          </p>

          <div class="purchase-row">
            <div class="qty-box">
              <button @click="decQty">−</button>
              <input v-model.number="qty" type="number" :min="minQty" :step="stepQty" />
              <button @click="incQty">+</button>
            </div>
            <span class="qty-hint">{{ formatQty(qty) }} {{ product.unit }}</span>
            <button class="btn btn-secondary" @click="add">Agregar al carrito</button>
          </div>
          <p v-if="qty < minQty" class="error-msg">El mínimo es {{ formatQty(minQty) }} {{ product.unit }}</p>
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
const minQty = computed(() => Number(product.value?.minQuantity) || 1)
const stepQty = computed(() => Number(product.value?.stepQuantity) || 1)
const unitLabel = computed(() => {
  const u = (product.value?.unit || '').toLowerCase()
  if (u === 'kilo') return 'kg'
  if (u === 'gramos') return 'g'
  return product.value?.unit || ''
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

async function load() {
  loading.value = true
  product.value = null
  try {
    const data = await api.get(`/api/catalog/products/${route.params.slug}`)
    product.value = data.product
    const mq = Number(data.product?.minQuantity) || 1
    qty.value = mq
  } finally {
    loading.value = false
  }
}

function add() {
  if (Number(qty.value) < minQty.value) qty.value = minQty.value
  cart.add(product.value, qty.value)
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
