<template>
  <div class="page profile-page">
    <div class="container">
      <div v-if="!auth.user" class="spinner"></div>
      <div v-else class="profile-layout">
        <aside class="profile-menu">
          <div class="profile-card-info">
            <div class="avatar">{{ initials }}</div>
            <h2>{{ auth.user.name }}</h2>
            <p class="muted">{{ auth.user.phone }}</p>
            <p v-if="auth.user.email" class="muted">{{ auth.user.email }}</p>
          </div>
          <nav class="profile-nav">
            <router-link to="/pedidos" class="nav-item">Mis pedidos</router-link>
            <router-link to="/perfil/direcciones/nueva" class="nav-item">Agregar dirección</router-link>
            <button class="nav-item logout" @click="logout">Cerrar sesión</button>
          </nav>
        </aside>

        <div class="profile-content">
          <h1 class="section-title">Mis direcciones</h1>
          <p class="muted profile-sub">Las direcciones se usan para calcular el envío y el radio de entrega</p>

          <div v-if="addresses.length === 0" class="empty-state">
            <h3>No tienes direcciones guardadas</h3>
            <router-link to="/perfil/direcciones/nueva" class="btn btn-primary">Agregar tu primera dirección</router-link>
          </div>

          <div v-else class="address-list">
            <div v-for="addr in addresses" :key="addr.id" class="address-row">
              <div class="address-row-info">
                <p class="addr-label">
                  {{ addr.label }}
                  <span v-if="addr.isDefault" class="default-tag">default</span>
                </p>
                <p class="addr-street">{{ addr.street }}{{ addr.number ? ' ' + addr.number : '' }}, {{ addr.city }}</p>
                <p v-if="addr.reference" class="muted addr-ref">{{ addr.reference }}</p>
              </div>
              <div class="address-row-actions">
                <button v-if="!addr.isDefault" class="btn btn-outline btn-xs" @click="setDefault(addr)">Hacer default</button>
                <router-link :to="`/perfil/direcciones/${addr.id}`" class="btn btn-outline btn-xs">Editar</router-link>
                <button class="btn btn-danger btn-xs" @click="remove(addr)">Eliminar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const addresses = ref([])

const initials = computed(() =>
  auth.user?.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)

async function load() {
  try {
    const data = await api.get('/api/addresses')
    addresses.value = data.addresses
  } catch {
    addresses.value = []
  }
}

async function setDefault(addr) {
  try {
    await api.patch(`/api/addresses/${addr.id}/default`)
    await load()
  } catch {
    // noop
  }
}

async function remove(addr) {
  if (!confirm(`¿Eliminar la dirección "${addr.label}"?`)) return
  try {
    await api.del(`/api/addresses/${addr.id}`)
    await load()
  } catch {
    // noop
  }
}

async function logout() {
  await auth.logout()
  router.push({ name: 'home' })
}

onMounted(load)
</script>

<style scoped>
.profile-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 32px;
  align-items: start;
}

.profile-menu {
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius);
  overflow: hidden;
}

.profile-card-info {
  padding: 28px 24px;
  text-align: center;
  background: linear-gradient(135deg, var(--green-dark), var(--green-mid));
  color: white;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 900;
  margin: 0 auto 12px;
}

.profile-card-info h2 {
  font-size: 1.1rem;
  margin-bottom: 2px;
}

.profile-card-info .muted {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
}

.profile-nav {
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.nav-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--green-dark);
  transition: var(--transition);
  background: none;
  border: none;
}

.nav-item:hover {
  background: var(--gray-light);
}

.nav-item.logout {
  color: var(--red);
}

.profile-sub {
  margin-bottom: 20px;
}

.address-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.address-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  padding: 16px 18px;
}

.addr-label {
  font-weight: 700;
  color: var(--dark);
}

.default-tag {
  font-size: 0.68rem;
  background: var(--green-light);
  color: white;
  padding: 2px 8px;
  border-radius: 50px;
  margin-left: 6px;
}

.addr-street {
  font-size: 0.88rem;
}

.addr-ref {
  font-size: 0.8rem;
}

.address-row-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-xs {
  padding: 7px 14px;
  font-size: 0.78rem;
}

@media (max-width: 768px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }

  .address-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
