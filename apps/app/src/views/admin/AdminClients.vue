<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Clientes</h1>
        <p class="muted admin-sub">{{ total }} cliente(s)</p>
      </div>
      <div class="search-box">
        <input v-model="search" class="form-control" placeholder="Buscar nombre, teléfono o email…" @input="onSearch" />
      </div>
    </div>

    <div v-if="loading" class="spinner"></div>

    <div v-else class="admin-card" style="padding: 0">
      <table class="admin-table">
        <thead>
          <tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Pedidos</th><th>Direcciones</th><th>Registro</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-if="clients.length === 0"><td colspan="7" class="empty-cell">Sin clientes</td></tr>
          <tr v-for="c in clients" :key="c.id">
            <td class="client-cell">{{ c.name }}</td>
            <td>{{ c.phone }}</td>
            <td>{{ c.email || '—' }}</td>
            <td>{{ c._count.orders }}</td>
            <td>{{ c._count.addresses }}</td>
            <td class="muted">{{ formatDate(c.createdAt) }}</td>
            <td class="actions-cell">
              <button class="action-link" @click="openDetail(c.id)">Ver</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="detail" class="modal-overlay" @click.self="detail = null">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ detail.name }}</h2>
          <button class="close-btn" @click="detail = null">✕</button>
        </div>
        <div class="modal-body">
          <p><strong>Teléfono:</strong> {{ detail.phone }}</p>
          <p v-if="detail.email"><strong>Email:</strong> {{ detail.email }}</p>
          <h3 class="modal-sub">Direcciones</h3>
          <div v-if="detail.addresses.length === 0" class="muted">Sin direcciones</div>
          <div v-for="a in detail.addresses" :key="a.id" class="modal-address">
            <p>{{ a.label }} <span v-if="a.isDefault" class="badge badge-delivered">default</span></p>
            <p class="muted">{{ a.street }}{{ a.number ? ' ' + a.number : '' }}, {{ a.city }}</p>
          </div>
          <h3 class="modal-sub">Últimos pedidos</h3>
          <div v-if="detail.orders.length === 0" class="muted">Sin pedidos</div>
          <div v-for="o in detail.orders" :key="o.id" class="modal-order">
            <span class="code">{{ o.code }}</span>
            <span class="badge" :class="`badge-${o.status.toLowerCase()}`">{{ STATUS_LABELS[o.status] }}</span>
            <span class="order-total">{{ money(o.total) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api/client.js'
import { money, formatDate, STATUS_LABELS } from '../../utils/format.js'

const clients = ref([])
const total = ref(0)
const loading = ref(true)
const search = ref('')
const detail = ref(null)
let timer = null

async function load() {
  loading.value = true
  try {
    const data = await api.get('/api/admin/clients', { search: search.value, take: 100 })
    clients.value = data.clients
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function onSearch() {
  clearTimeout(timer)
  timer = setTimeout(load, 350)
}

async function openDetail(id) {
  try {
    const data = await api.get(`/api/admin/clients/${id}`)
    detail.value = data.client
  } catch {
    // noop
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

.search-box input {
  min-width: 300px;
  padding: 10px 14px;
}

.client-cell {
  font-weight: 600;
}

.actions-cell {
  text-align: right;
}

.action-link {
  background: none;
  border: none;
  color: var(--green-dark);
  font-weight: 600;
  font-size: 0.85rem;
}

.empty-cell {
  text-align: center;
  color: var(--gray);
  padding: 30px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  background: white;
  border-radius: var(--radius);
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--gray-mid);
}

.modal-header h2 {
  font-size: 1.1rem;
  color: var(--green-dark);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1rem;
  color: var(--gray);
}

.modal-body {
  padding: 18px 22px;
}

.modal-sub {
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--green-dark);
  margin: 16px 0 8px;
}

.modal-address {
  padding: 8px 0;
  border-bottom: 1px dashed var(--gray-mid);
}

.modal-address p {
  font-size: 0.88rem;
}

.modal-order {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--gray-mid);
}

.code {
  font-weight: 700;
  flex: 1;
}

.order-total {
  font-weight: 700;
}
</style>
