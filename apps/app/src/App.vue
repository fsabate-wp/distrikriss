<template>
  <div class="app">
    <AppHeader @open-cart="cartOpen = true" />
    <div v-if="settings.settings && settings.settings.storeOpen === false" class="closed-banner">
      La tienda está temporalmente cerrada. Vuelve más tarde.
    </div>
    <div v-if="showExpiredToast" class="session-toast">
      Tu sesión expiró. Redirigiendo al login…
    </div>
    <main>
      <router-view />
    </main>
    <AppFooter />
    <CartDrawer :open="cartOpen" @close="cartOpen = false" />
    <InstallBanner />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import CartDrawer from './components/CartDrawer.vue'
import InstallBanner from './components/InstallBanner.vue'
import { useAuthStore } from './stores/auth.js'
import { useSettingsStore } from './stores/settings.js'
import { registerPush, unregisterPush } from './lib/push.js'
import { applyAccentColor } from './lib/accent.js'
import { applySecondaryColor } from './lib/accent.js'
import { applyBranding } from './lib/branding.js'

const cartOpen = ref(false)
const showExpiredToast = ref(false)
let toastTimer = null
const auth = useAuthStore()
const settings = useSettingsStore()
const router = useRouter()

function applyVisuals() {
  applyAccentColor(settings.settings?.accentColor)
  applySecondaryColor(settings.settings?.secondaryColor)
  applyBranding(settings.settings)
}

onMounted(async () => {
  if (!auth.initialized) await auth.fetchMe()
  else auth.initExpiredListener?.()
  await settings.load()
  applyVisuals()
  if (auth.isAuthed) registerPush()
  window.addEventListener('auth:expired', () => {
    showExpiredToast.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { showExpiredToast.value = false }, 4000)
    const currentPath = window.location.pathname + window.location.search
    const isAuthPage = currentPath.startsWith('/login') || currentPath.startsWith('/registro')
    if (!isAuthPage && router.currentRoute.value.name !== 'login') {
      router.push({ name: 'login', query: { redirect: currentPath, expired: '1' } }).catch(() => {})
    }
  })
})

watch(
  () => [settings.settings?.accentColor, settings.settings?.secondaryColor],
  () => applyVisuals(),
)

watch(
  () => [settings.settings?.faviconUrl, settings.settings?.appIconUrl],
  () => applyVisuals(),
)

watch(
  () => auth.user,
  (user, prev) => {
    if (user && !prev) registerPush()
    if (!user && prev) unregisterPush()
  },
)
</script>

<style>
.closed-banner {
  background: #ffd400;
  color: #5a4a00;
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
  padding: 10px 16px;
}
.session-toast {
  background: #dc3545;
  color: white;
  text-align: center;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 10px 16px;
  animation: slideDown 0.3s ease;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
