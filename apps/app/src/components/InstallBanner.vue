<template>
  <div v-if="visible" class="install-banner" role="dialog" aria-label="Instalar DistriKriss">
    <div class="install-banner-inner">
      <svg class="install-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <div class="install-banner-text">
        <strong>Instala DistriKriss</strong>
        <span>{{ message }}</span>
      </div>
      <button v-if="canInstall" class="btn btn-primary btn-sm install-btn" @click="install">Instalar</button>
      <button class="install-close" @click="dismiss" aria-label="Cerrar">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const DISMISS_KEY = 'distrikriss-install-banner-dismissed'
const visible = ref(false)
const canInstall = ref(false)
const deferredPrompt = ref(null)
const isIOS = ref(false)

const message = computed(() => {
  if (canInstall.value) return 'Accede más rápido desde tu pantalla de inicio.'
  if (isIOS.value) return 'Toca Compartir y elige «Agregar a pantalla de inicio».'
  return 'Guarda la tienda en tu dispositivo para acceder más rápido.'
})

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

function storeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* noop */
  }
}

onMounted(() => {
  if (isStandalone()) return
  try {
    if (localStorage.getItem(DISMISS_KEY)) return
  } catch {
    /* noop */
  }
  isIOS.value = isIos()

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    canInstall.value = true
    visible.value = true
  })

  window.addEventListener('appinstalled', () => {
    visible.value = false
  })

  if (isIOS.value) visible.value = true
})

async function install() {
  if (!deferredPrompt.value) return
  deferredPrompt.value.prompt()
  await deferredPrompt.value.userChoice
  deferredPrompt.value = null
  visible.value = false
}

function dismiss() {
  storeDismissed()
  visible.value = false
}
</script>

<style scoped>
.install-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1050;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(10px);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
  border-top: 1px solid var(--gray-mid);
  animation: slide-up 0.3s ease;
}

.install-banner-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.install-icon {
  flex-shrink: 0;
  color: var(--green-dark);
}

.install-banner-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.install-banner-text strong {
  font-size: 0.95rem;
  color: var(--green-dark);
}

.install-banner-text span {
  font-size: 0.8rem;
  color: var(--gray);
}

.install-btn {
  flex-shrink: 0;
  padding: 10px 22px;
  font-size: 0.85rem;
}

.install-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--gray);
  font-size: 1.1rem;
  padding: 6px;
}

.install-close:hover {
  color: var(--dark);
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@media (max-width: 480px) {
  .install-banner-text span {
    font-size: 0.74rem;
  }

  .install-btn {
    padding: 8px 16px;
  }
}
</style>
