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
              <p class="cart-item-meta">{{ money(item.price) }} / {{ item.unit }}</p>
              <div class="qty-control">
                <button @click="cart.setQuantity(item.productId, item.quantity - 1)">−</button>
                <span>{{ item.quantity }}</span>
                <button @click="cart.setQuantity(item.productId, item.quantity + 1)">+</button>
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
          <span>Subtotal</span>
          <strong>{{ money(cart.subtotal) }}</strong>
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
import { money } from '../utils/format.js'

defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const cart = useCartStore()
const auth = useAuthStore()
const router = useRouter()

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
  color: var(--green-dark);
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
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  background: white;
  border-radius: 50px;
  padding: 3px 8px;
  border: 1px solid var(--gray-mid);
}

.qty-control button {
  background: none;
  border: none;
  font-size: 1rem;
  font-weight: 700;
  color: var(--green-dark);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qty-control span {
  font-weight: 700;
  min-width: 18px;
  text-align: center;
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

.back-btn {
  margin-top: 10px;
}
</style>
