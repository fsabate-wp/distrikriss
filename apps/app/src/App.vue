<template>
  <div class="app">
    <AppHeader @open-cart="cartOpen = true" />
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

const cartOpen = ref(false)
const auth = useAuthStore()
const settings = useSettingsStore()

onMounted(async () => {
  if (!auth.initialized) await auth.fetchMe()
  await settings.load()
  applyAccentColor(settings.settings?.accentColor)
  if (auth.isAuthed) registerPush()
})

watch(
  () => settings.settings?.accentColor,
  (hex) => applyAccentColor(hex),
)

watch(
  () => auth.user,
  (user, prev) => {
    if (user && !prev) registerPush()
    if (!user && prev) unregisterPush()
  },
)
</script>
