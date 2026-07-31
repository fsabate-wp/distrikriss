<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="admin-brand">
        <span class="brand-distri">Distri</span><span class="brand-kriss">Kriss</span>
        <p class="admin-brand-sub">Panel de administración</p>
      </div>
      <nav class="admin-nav">
        <router-link to="/admin" class="admin-nav-link" :class="{ active: isActive('') }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Dashboard
        </router-link>
        <router-link to="/admin/pedidos" class="admin-nav-link" :class="{ active: isActive('pedidos') }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Pedidos
        </router-link>
        <router-link to="/admin/productos" class="admin-nav-link" :class="{ active: isActive('productos') }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          Productos
        </router-link>
        <router-link to="/admin/categorias" class="admin-nav-link" :class="{ active: isActive('categorias') }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></svg>
          Categorías
        </router-link>
        <router-link to="/admin/clientes" class="admin-nav-link" :class="{ active: isActive('clientes') }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Clientes
        </router-link>
        <router-link to="/admin/configuracion" class="admin-nav-link" :class="{ active: isActive('configuracion') }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configuración
        </router-link>
      </nav>
      <router-link to="/" class="back-store">← Volver a la tienda</router-link>
    </aside>

    <main class="admin-content">
      <div class="container admin-container">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

function isActive(prefix) {
  return route.path === '/admin' ? prefix === '' : route.path.startsWith(`/admin/${prefix}`)
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: calc(100vh - 68px);
}

.admin-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--dark);
  color: white;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 68px;
  height: calc(100vh - 68px);
}

.brand-distri {
  font-size: 1.3rem;
  font-weight: 900;
}

.brand-kriss {
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--red);
}

.admin-brand-sub {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 28px;
  flex: 1;
}

.admin-nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: var(--radius-sm);
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
  font-size: 0.9rem;
  transition: var(--transition);
}

.admin-nav-link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.admin-nav-link.active {
  background: var(--green-dark);
  color: white;
}

.back-store {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 14px;
}

.back-store:hover {
  color: white;
}

.admin-content {
  flex: 1;
  background: var(--gray-light);
  min-height: calc(100vh - 68px);
}

.admin-container {
  padding-top: 28px;
  padding-bottom: 40px;
  max-width: 1100px;
}

@media (max-width: 768px) {
  .admin-layout {
    flex-direction: column;
  }

  .admin-sidebar {
    width: 100%;
    position: static;
    height: auto;
    padding: 16px;
  }

  .admin-nav {
    flex-direction: row;
    flex-wrap: wrap;
    margin-top: 14px;
    gap: 6px;
  }

  .admin-nav-link {
    padding: 8px 12px;
    font-size: 0.82rem;
  }
}
</style>
