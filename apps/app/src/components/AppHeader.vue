<template>
  <header class="app-header">
    <div class="container header-inner">
      <router-link to="/" class="brand">
        <span class="brand-distri">Distri</span><span class="brand-kriss">Kriss</span>
      </router-link>

      <nav class="nav-links" :class="{ open: menuOpen }">
        <router-link to="/" @click="menuOpen = false">Tienda</router-link>
        <router-link v-if="auth.isAuthed" to="/pedidos" @click="menuOpen = false">Mis pedidos</router-link>
        <router-link v-if="auth.isAdmin" to="/admin" class="admin-link" @click="menuOpen = false">Admin</router-link>
        <template v-if="auth.isAuthed">
          <router-link to="/perfil" @click="menuOpen = false">Mi perfil</router-link>
          <button class="link-btn" @click="logout">Salir</button>
        </template>
        <template v-else>
          <router-link to="/login" @click="menuOpen = false">Ingresar</router-link>
          <router-link to="/registro" class="btn btn-primary btn-sm" @click="menuOpen = false">Regístrate</router-link>
        </template>
      </nav>

      <div class="header-actions">
        <button class="cart-btn" @click="$emit('open-cart')" aria-label="Abrir carrito">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span v-if="cart.count > 0" class="cart-badge">{{ cart.count }}</span>
        </button>
        <button class="navbar-toggle" @click="menuOpen = !menuOpen" :aria-label="menuOpen ? 'Cerrar menú' : 'Abrir menú'">
          <span :class="{ open: menuOpen }"></span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useCartStore } from '../stores/cart.js'

defineEmits(['open-cart'])
const auth = useAuthStore()
const cart = useCartStore()
const router = useRouter()
const menuOpen = ref(false)

async function logout() {
  await auth.logout()
  menuOpen.value = false
  router.push({ name: 'home' })
}
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 68px;
}

.brand {
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: -0.5px;
}

.brand-distri {
  color: var(--dark);
}

.brand-kriss {
  color: var(--red);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 24px;
}

.nav-links a,
.link-btn {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--dark);
  transition: var(--transition);
  background: none;
  border: none;
  padding: 0;
}

.nav-links a:hover,
.link-btn:hover {
  color: var(--green-light);
}

.admin-link {
  background: var(--green-dark);
  color: white;
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 0.8rem;
}

.btn-sm {
  padding: 9px 20px;
  font-size: 0.85rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.cart-btn {
  position: relative;
  background: none;
  border: none;
  color: var(--dark);
  display: flex;
  align-items: center;
  padding: 6px;
}

.cart-badge {
  position: absolute;
  top: -2px;
  right: -6px;
  background: var(--red);
  color: white;
  font-size: 0.68rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.navbar-toggle {
  display: none;
  background: var(--gray-light);
  border: 1.5px solid var(--gray-mid);
  border-radius: 12px;
  cursor: pointer;
  width: 44px;
  height: 44px;
  position: relative;
  transition: var(--transition);
}

.navbar-toggle:hover {
  border-color: var(--green-light);
}

.navbar-toggle span,
.navbar-toggle span::before,
.navbar-toggle span::after {
  display: block;
  width: 20px;
  height: 2.5px;
  background: var(--dark);
  border-radius: 3px;
  transition: var(--transition);
}

.navbar-toggle span {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.navbar-toggle span::before,
.navbar-toggle span::after {
  content: '';
  position: absolute;
  left: 0;
}

.navbar-toggle span::before {
  top: -7px;
}

.navbar-toggle span::after {
  top: 7px;
}

.navbar-toggle span.open {
  background: transparent;
}

.navbar-toggle span.open::before {
  top: 0;
  transform: rotate(45deg);
}

.navbar-toggle span.open::after {
  top: 0;
  transform: rotate(-45deg);
}

@media (max-width: 768px) {
  .nav-links {
    position: fixed;
    top: 68px;
    left: 0;
    right: 0;
    background: rgba(255, 255, 255, 0.98);
    flex-direction: column;
    align-items: flex-start;
    padding: 24px 28px;
    gap: 18px;
    opacity: 0;
    pointer-events: none;
    transition: var(--transition);
    box-shadow: var(--shadow);
  }

  .nav-links.open {
    opacity: 1;
    pointer-events: all;
  }

  .nav-links a,
  .link-btn {
    font-size: 1.1rem;
  }

  .navbar-toggle {
    display: block;
  }
}
</style>
