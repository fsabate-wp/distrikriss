<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Productos</h1>
        <p class="muted admin-sub">{{ products.length }} producto(s)</p>
      </div>
      <div class="toolbar-right">
        <div class="search-box">
          <input v-model="search" class="form-control" placeholder="Buscar producto…" @input="onSearch" />
        </div>
        <router-link to="/admin/productos/nuevo" class="btn btn-primary btn-sm">+ Nuevo</router-link>
      </div>
    </div>

    <div v-if="loading" class="spinner"></div>

    <div v-else class="admin-card" style="padding: 0">
      <table class="admin-table">
        <thead>
          <tr>
            <th></th>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Presentación</th>
            <th>Stock</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="products.length === 0"><td colspan="8" class="empty-cell">Sin productos</td></tr>
          <tr v-for="p in products" :key="p.id">
            <td class="thumb-cell">
              <img v-if="p.imageUrl" :src="p.imageUrl" class="thumb" />
              <span v-else class="thumb-fallback">{{ p.name[0] }}</span>
            </td>
            <td class="name-cell">{{ p.name }}</td>
            <td>{{ p.category?.name || '—' }}</td>
            <td class="price-cell">{{ money(p.price) }}</td>
            <td>{{ p.unit }}</td>
            <td>
              <span v-if="p.stock < 0" class="muted">∞</span>
              <span v-else :class="{ 'low-stock': p.stock <= 5 }">{{ p.stock }}</span>
            </td>
            <td>
              <span class="badge" :class="p.active ? 'badge-delivered' : 'badge-cancelled'">
                {{ p.active ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
            <td class="actions-cell">
              <router-link :to="`/admin/productos/${p.id}`" class="action-link">Editar</router-link>
              <button class="action-link danger" @click="remove(p)">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api/client.js'
import { money } from '../../utils/format.js'

const products = ref([])
const loading = ref(true)
const search = ref('')
let timer = null

async function load() {
  loading.value = true
  try {
    const data = await api.get('/api/admin/products', { search: search.value })
    products.value = data.products
  } finally {
    loading.value = false
  }
}

function onSearch() {
  clearTimeout(timer)
  timer = setTimeout(load, 350)
}

async function remove(p) {
  if (!confirm(`¿Eliminar el producto "${p.name}"?`)) return
  try {
    await api.del(`/api/admin/products/${p.id}`)
    await load()
  } catch (err) {
    alert(err.message)
  }
}

onMounted(load)
</script>

<style scoped>
.admin-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--green-dark);
}

.admin-sub {
  margin-bottom: 0;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-box input {
  min-width: 240px;
  padding: 10px 14px;
}

.btn-sm {
  padding: 10px 18px;
  font-size: 0.85rem;
}

.thumb-cell {
  width: 48px;
}

.thumb {
  width: 42px;
  height: 42px;
  object-fit: cover;
  border-radius: 8px;
}

.thumb-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--green-light);
  color: white;
  font-weight: 800;
}

.name-cell {
  font-weight: 600;
}

.price-cell {
  font-weight: 700;
  color: var(--green-dark);
}

.low-stock {
  color: var(--red);
  font-weight: 700;
}

.actions-cell {
  white-space: nowrap;
  text-align: right;
}

.action-link {
  background: none;
  border: none;
  color: var(--green-dark);
  font-weight: 600;
  font-size: 0.85rem;
  margin-left: 10px;
}

.action-link.danger {
  color: var(--red);
}

.empty-cell {
  text-align: center;
  color: var(--gray);
  padding: 30px;
}
</style>
