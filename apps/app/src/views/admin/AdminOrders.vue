<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Pedidos</h1>
        <p class="muted admin-sub">{{ total }} pedido(s)</p>
      </div>
      <div class="toolbar-right">
        <select v-model="statusFilter" class="form-control" @change="load">
          <option value="">Todos los estados</option>
          <option v-for="s in statusOrder" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
        </select>
        <div class="search-box">
          <input v-model="search" class="form-control" placeholder="Buscar código o cliente…" @input="onSearch" />
        </div>
      </div>
    </div>

    <div v-if="loading" class="spinner"></div>

    <div v-else class="admin-card" style="padding: 0">
      <table class="admin-table">
        <thead>
          <tr><th>Código</th><th>Cliente</th><th>Fecha entrega</th><th>Total</th><th>Pago</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-if="orders.length === 0"><td colspan="7" class="empty-cell">Sin pedidos</td></tr>
          <tr v-for="o in orders" :key="o.id">
            <td class="code-cell">{{ o.code }}</td>
            <td>
              <p class="client-name">{{ o.user.name }}</p>
              <p class="muted small">{{ o.user.phone }}</p>
            </td>
            <td>{{ formatDate(o.deliveryDate) }}<p class="muted small">{{ o.slotLabel }}</p></td>
            <td class="total-cell">{{ money(o.total) }}</td>
            <td>
              <span class="muted small">{{ PAYMENT_LABELS[o.paymentMethod] }}</span>
              <span v-if="o.paymentMethod === 'TRANSFER'" class="badge" :class="o.paymentStatus === 'PAID' ? 'badge-delivered' : 'badge-pending'">
                {{ o.paymentStatus === 'PAID' ? 'pagado' : 'pendiente' }}
              </span>
            </td>
            <td><span class="badge" :class="`badge-${o.status.toLowerCase()}`">{{ STATUS_LABELS[o.status] }}</span></td>
            <td class="actions-cell">
              <router-link :to="`/admin/pedidos/${o.id}`" class="action-link">Ver</router-link>
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
import { money, formatDate, STATUS_LABELS, PAYMENT_LABELS } from '../../utils/format.js'

const orders = ref([])
const total = ref(0)
const loading = ref(true)
const statusFilter = ref('')
const search = ref('')
const statusOrder = ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']
let timer = null

async function load() {
  loading.value = true
  try {
    const data = await api.get('/api/admin/orders', {
      status: statusFilter.value,
      search: search.value,
      take: 100,
    })
    orders.value = data.orders
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function onSearch() {
  clearTimeout(timer)
  timer = setTimeout(load, 350)
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

.toolbar-right select {
  width: 200px;
}

.search-box input {
  min-width: 220px;
  padding: 10px 14px;
}

.code-cell {
  font-weight: 800;
  color: var(--green-dark);
}

.client-name {
  font-weight: 600;
}

.small {
  font-size: 0.75rem;
}

.total-cell {
  font-weight: 700;
}

.actions-cell {
  text-align: right;
}

.action-link {
  color: var(--green-dark);
  font-weight: 600;
  font-size: 0.85rem;
}

.empty-cell {
  text-align: center;
  color: var(--gray);
  padding: 30px;
}
</style>
