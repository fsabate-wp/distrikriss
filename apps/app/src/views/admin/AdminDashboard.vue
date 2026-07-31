<template>
  <div>
    <h1 class="admin-title">Dashboard</h1>
    <p class="muted admin-sub">Resumen del negocio en tiempo real</p>

    <div v-if="loading" class="spinner"></div>

    <div v-else-if="stats">
      <div class="stat-grid">
        <div class="stat-card">
          <p class="stat-label">Pedidos hoy</p>
          <p class="stat-value">{{ stats.todayOrders }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Pendientes</p>
          <p class="stat-value">{{ stats.pendingOrders }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Ingresos hoy</p>
          <p class="stat-value">{{ money(stats.todayRevenue) }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Ingresos totales</p>
          <p class="stat-value">{{ money(stats.totalRevenue) }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Clientes</p>
          <p class="stat-value">{{ stats.clients }}</p>
        </div>
        <div class="stat-card">
          <p class="stat-label">Productos</p>
          <p class="stat-value">{{ stats.products }}</p>
        </div>
      </div>

      <div class="dash-grid">
        <div class="admin-card">
          <h2>Ventas últimos 14 días</h2>
          <div class="bars" v-if="stats.salesByDay.length">
            <div v-for="d in stats.salesByDay" :key="d.date" class="bar-col">
              <div class="bar" :style="{ height: barHeight(d.total) }" :title="`${d.date}: ${money(d.total)}`"></div>
              <span class="bar-label">{{ d.date.slice(5).replace('-', '/') }}</span>
            </div>
          </div>
        </div>

        <div class="admin-card">
          <h2>Pedidos por estado</h2>
          <div v-for="s in statusOrder" :key="s" class="status-row">
            <span class="badge" :class="`badge-${s.toLowerCase()}`">{{ STATUS_LABELS[s] }}</span>
            <div class="status-bar"><div class="status-fill" :class="`fill-${s.toLowerCase()}`" :style="{ width: statusWidth(s) }"></div></div>
            <span class="status-count">{{ statusCount(s) }}</span>
          </div>
        </div>
      </div>

      <div class="admin-card">
        <h2>Productos más vendidos</h2>
        <table class="admin-table">
          <thead>
            <tr><th>Producto</th><th>Cantidad vendida</th></tr>
          </thead>
          <tbody>
            <tr v-if="stats.topProducts.length === 0"><td colspan="2">Aún no hay ventas</td></tr>
            <tr v-for="(t, i) in stats.topProducts" :key="i">
              <td>{{ t.name }}</td>
              <td>{{ t.quantity }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api/client.js'
import { money, STATUS_LABELS } from '../../utils/format.js'

const stats = ref(null)
const loading = ref(true)
const statusOrder = ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']

function statusCount(status) {
  const row = stats.value?.ordersByStatus?.find((s) => s.status === status)
  return row?._count?._all ?? 0
}

function statusWidth(status) {
  const total = Math.max(1, statusOrder.reduce((acc, s) => acc + statusCount(s), 0))
  return `${Math.round((statusCount(status) / total) * 100)}%`
}

function barHeight(total) {
  const max = Math.max(...stats.value.salesByDay.map((d) => d.total), 1)
  return `${Math.max(4, Math.round((total / max) * 120))}px`
}

onMounted(async () => {
  try {
    const data = await api.get('/api/admin/stats')
    stats.value = data.stats
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.admin-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--green-dark);
}

.admin-sub {
  margin-bottom: 22px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.dash-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
  align-items: start;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 150px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 100%;
}

.bar {
  width: 100%;
  max-width: 28px;
  background: linear-gradient(var(--green-light), var(--green-dark));
  border-radius: 4px 4px 0 0;
  min-height: 4px;
}

.bar-label {
  font-size: 0.6rem;
  color: var(--gray);
  transform: rotate(-35deg);
  white-space: nowrap;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.status-bar {
  flex: 1;
  height: 8px;
  background: var(--gray-mid);
  border-radius: 4px;
  overflow: hidden;
}

.status-fill {
  height: 100%;
  border-radius: 4px;
}

.fill-pending {
  background: #E65100;
}

.fill-confirmed {
  background: #1565C0;
}

.fill-preparing {
  background: #6A1B9A;
}

.fill-out_for_delivery {
  background: #2E7D32;
}

.fill-delivered {
  background: #1B5E20;
}

.fill-cancelled {
  background: #C62828;
}

.status-count {
  font-weight: 700;
  min-width: 22px;
  text-align: right;
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .dash-grid {
    grid-template-columns: 1fr;
  }
}
</style>
