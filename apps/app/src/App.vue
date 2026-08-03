<template>
  <div class="app">
    <AppHeader @open-cart="cartOpen = true" />
    <div v-if="settings.settings && settings.settings.storeOpen === false" class="closed-banner">
      La tienda está temporalmente cerrada. Vuelve más tarde.
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
const auth = useAuthStore()
const settings = useSettingsStore()

function applyVisuals() {
  applyAccentColor(settings.settings?.accentColor)
  applySecondaryColor(settings.settings?.secondaryColor)
  applyBranding(settings.settings)
}

onMounted(async () => {
  if (!auth.initialized) await auth.fetchMe()
  await settings.load()
  applyVisuals()
  if (auth.isAuthed) registerPush()
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
</style>
