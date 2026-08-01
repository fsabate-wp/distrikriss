<template>
  <footer class="app-footer">
    <div class="container footer-inner">
      <div>
        <span class="brand-distri">Distri</span><span class="brand-kriss">Kriss</span>
        <p class="muted">Lo Mejor en precio y calidad</p>
      </div>
      <div v-if="settings.settings" class="footer-info">
        <p><strong>{{ settings.settings.storeAddress }}</strong></p>
        <p>{{ settings.settings.phone }} · {{ settings.settings.whatsapp }}</p>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="container">
        <p>Desarrollado por <a href="https://fernandosabate.com" target="_blank" rel="noopener">fernandosabate.com</a></p>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { useSettingsStore } from '../stores/settings.js'

const settings = useSettingsStore()
</script>

<style scoped>
.app-footer {
  background: var(--dark);
  color: white;
  padding: 40px 0;
  margin-top: 40px;
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.brand-distri {
  font-size: 1.4rem;
  font-weight: 900;
  color: white;
}

.brand-kriss {
  font-size: 1.4rem;
  font-weight: 900;
  color: var(--red);
}

.footer-info p {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
}

.footer-bottom {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 32px;
  padding-top: 20px;
}

.footer-bottom p {
  text-align: center;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.4);
}

.footer-bottom a {
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  transition: var(--transition);
}

.footer-bottom a:hover {
  color: white;
}
</style>
