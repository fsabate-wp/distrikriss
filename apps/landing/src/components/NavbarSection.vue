<template>
  <nav class="navbar" :class="{ scrolled }">
    <div class="container navbar-inner">
      <a href="#" class="navbar-brand">
        <span class="brand-distri">Distri</span><span class="brand-kriss">Kriss</span>
      </a>
      <ul class="navbar-links" :class="{ open: menuOpen }">
        <li><a href="#productos" @click="menuOpen = false">Productos</a></li>
        <li><a href="#nosotros" @click="menuOpen = false">Por qué nosotros</a></li>
        <li><a href="#ubicacion" @click="menuOpen = false">Ubicación</a></li>
        <li><a href="#contacto" @click="menuOpen = false">Contacto</a></li>
        <li class="navbar-cta-mobile"><a :href="appUrl + '/registro'" @click="menuOpen = false">Crear cuenta</a></li>
      </ul>
      <a
        :href="appUrl + '/registro'"
        class="btn btn-primary btn-nav"
      >
        Pedir online
      </a>
      <a
        href="https://wa.me/593959841957?text=Hola%20DistriKriss%2C%20me%20interesa%20hacer%20un%20pedido"
        class="btn btn-whatsapp btn-nav"
        target="_blank"
        rel="noopener"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        WhatsApp
      </a>
      <button class="navbar-toggle" :class="{ active: menuOpen }" @click="menuOpen = !menuOpen" :aria-label="menuOpen ? 'Cerrar menú' : 'Abrir menú'">
        <span :class="{ open: menuOpen }"></span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const appUrl = import.meta.env.VITE_APP_URL || 'https://app.distrikriss.com'
const scrolled = ref(false)
const menuOpen = ref(false)

const handleScroll = () => {
  scrolled.value = window.scrollY > 50
}

onMounted(() => window.addEventListener('scroll', handleScroll))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))
</script>

<style scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 16px 0;
  transition: var(--transition);
  background: transparent;
}

.navbar.scrolled {
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08);
  padding: 10px 0;
}

.navbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.navbar-brand {
  font-size: 1.6rem;
  font-weight: 900;
  letter-spacing: -0.5px;
  transition: var(--transition);
}

.brand-distri {
  color: white;
}

.brand-kriss {
  color: #EF5350;
}

.navbar.scrolled .brand-distri {
  color: var(--green-dark);
}

.navbar.scrolled .brand-kriss {
  color: var(--red);
}

.navbar-links {
  display: flex;
  list-style: none;
  gap: 32px;
}

.navbar-links a {
  font-weight: 600;
  font-size: 0.95rem;
  color: white;
  transition: var(--transition);
  position: relative;
}

.navbar.scrolled .navbar-links a {
  color: var(--green-dark);
}

.navbar-links a::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 0;
  height: 2px;
  background: var(--green-light);
  transition: var(--transition);
}

.navbar-links a:hover::after {
  width: 100%;
}

.btn-nav {
  padding: 10px 24px;
  font-size: 0.9rem;
}

.navbar-toggle {
  display: none;
  background: rgba(255, 255, 255, 0.15);
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  border-radius: 12px;
  cursor: pointer;
  width: 44px;
  height: 44px;
  position: relative;
  z-index: 1010;
  transition: var(--transition);
}

.navbar-toggle span,
.navbar-toggle span::before,
.navbar-toggle span::after {
  display: block;
  width: 20px;
  height: 2.5px;
  background: white;
  border-radius: 3px;
  transition: var(--transition);
}

.navbar.scrolled .navbar-toggle span,
.navbar.scrolled .navbar-toggle span::before,
.navbar.scrolled .navbar-toggle span::after {
  background: var(--green-dark);
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

.navbar.scrolled .navbar-toggle span.open {
  background: transparent;
}

.navbar-toggle span.open::before,
.navbar-toggle span.open::after {
  top: 0;
  background: var(--green-dark);
}

.navbar-toggle span.open::before {
  transform: rotate(45deg);
}

.navbar-toggle span.open::after {
  transform: rotate(-45deg);
}

.navbar-toggle.active {
  background: var(--gray-light);
  border-color: var(--gray-mid);
}

.navbar-cta-mobile {
  display: none;
}

@media (max-width: 768px) {
  .navbar-links {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(10px);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    opacity: 0;
    pointer-events: none;
    transition: var(--transition);
    z-index: 1005;
  }

  .navbar-cta-mobile {
    display: block;
  }

  .navbar-cta-mobile a {
    display: inline-block;
    background: var(--green-dark);
    color: var(--white) !important;
    padding: 12px 28px;
    border-radius: 50px;
    font-size: 1rem;
    margin-top: 8px;
  }

  .navbar-links.open {
    opacity: 1;
    pointer-events: all;
  }

  .navbar-links a {
    font-size: 1.3rem;
    color: var(--green-dark);
  }

  .btn-nav {
    display: none;
  }

  .navbar-toggle {
    display: block;
  }
}
</style>
