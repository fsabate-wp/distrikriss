<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Configuración</h1>
        <p class="muted admin-sub">Organiza la tienda, las entregas, los pagos y la facturación</p>
      </div>
    </div>

    <nav class="settings-tabs">
      <router-link
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="settings-tab"
        :class="{ active: route.path === tab.to || route.path.startsWith(tab.to + '/') }"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view />
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { to: '/admin/configuracion', label: 'General' },
  { to: '/admin/configuracion/apariencia', label: 'Apariencia' },
  { to: '/admin/configuracion/entregas', label: 'Entregas' },
  { to: '/admin/configuracion/zonas', label: 'Zonas' },
  { to: '/admin/configuracion/horarios', label: 'Horarios' },
  { to: '/admin/configuracion/pagos', label: 'Pagos' },
  { to: '/admin/configuracion/facturacion', label: 'Facturación SRI' },
]
</script>

<style scoped>
.admin-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--dark);
}

.admin-sub {
  margin-bottom: 0;
}

.settings-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius);
  padding: 8px;
}

.settings-tab {
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--gray);
  transition: var(--transition);
}

.settings-tab:hover {
  background: var(--gray-light);
  color: var(--dark);
}

.settings-tab.active {
  background: var(--green-dark);
  color: white;
}
</style>

<style>
.settings-page .switch-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.settings-page .switch-text {
  flex: 1;
}

.settings-page .switch-text strong {
  color: var(--dark);
}

.settings-page .switch-text p {
  font-size: 0.85rem;
  margin-top: 2px;
}

.settings-page .switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  flex-shrink: 0;
}

.settings-page .switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.settings-page .switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--gray-mid);
  border-radius: 50px;
  transition: var(--transition);
}

.settings-page .switch-slider::before {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: var(--transition);
  box-shadow: var(--shadow);
}

.settings-page .switch input:checked + .switch-slider {
  background: var(--green-dark);
}

.settings-page .switch input:checked + .switch-slider::before {
  transform: translateX(24px);
}

.settings-page .image-row {
  display: flex;
  gap: 16px;
  align-items: center;
}

.settings-page .image-preview {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--gray-light);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-page .image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.settings-page .preview-fallback {
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--green-light);
}

.settings-page .image-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.settings-page .file-btn {
  position: relative;
  cursor: pointer;
}

.settings-page .color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-page .color-input {
  width: 52px;
  height: 42px;
  padding: 0;
  border: 1.5px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.settings-page .color-hex {
  max-width: 140px;
  text-transform: uppercase;
}

.settings-page .color-help {
  font-size: 0.8rem;
  margin-top: 8px;
}

.settings-page .day-checks {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.settings-page .day-check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid var(--gray-mid);
  border-radius: 50px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.settings-page .hours-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-page .hours-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-page .hours-day {
  width: 56px;
  font-weight: 700;
  font-size: 0.88rem;
}

.settings-page .hours-closed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--gray);
}

.settings-page .time {
  width: 90px;
  text-align: center;
}

.settings-page .slot-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.settings-page .slot-row input {
  padding: 10px 12px;
}

.settings-page .capacity {
  width: 90px;
}

.settings-page .saved-note {
  color: var(--green-mid);
  font-weight: 700;
}

.settings-page .actions {
  display: flex;
  justify-content: flex-end;
}

.settings-page .error-msg {
  color: var(--red);
  font-weight: 600;
  margin-top: 12px;
}

@media (max-width: 700px) {
  .settings-page .form-grid {
    grid-template-columns: 1fr;
  }

  .settings-page .slot-row {
    flex-wrap: wrap;
  }
}
</style>
