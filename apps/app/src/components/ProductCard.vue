<template>
  <div class="product-card" :class="{ 'is-featured': product.featured }">
    <router-link :to="`/producto/${product.slug}`" class="product-link">
      <div class="product-img">
        <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" loading="lazy" />
        <span v-else class="product-fallback">{{ product.name[0] }}</span>
        <span v-if="product.featured" class="featured-badge">★ Destacado</span>
      </div>
      <div class="product-body">
        <h3 class="product-name">{{ product.name }}</h3>
        <p class="product-unit">{{ product.unit }}</p>
        <p class="product-price">{{ money(product.price) }}</p>
      </div>
    </router-link>
    <button class="add-btn" @click="addToCart" aria-label="Agregar al carrito">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </button>
  </div>
</template>

<script setup>
import { useCartStore } from '../stores/cart.js'
import { money } from '../utils/format.js'

const props = defineProps({ product: { type: Object, required: true } })
const cart = useCartStore()

function addToCart() {
  cart.add(props.product, 1)
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
  background: var(--green-dark);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 50px;
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
  margin-bottom: 6px;
}

.product-price {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--green-dark);
}

.add-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--green-dark);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition);
  box-shadow: var(--shadow);
}

.add-btn:hover {
  background: var(--green-light);
  transform: scale(1.08);
}
</style>
