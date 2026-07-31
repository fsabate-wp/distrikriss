<template>
  <div>
    <router-link to="/admin/pedidos" class="back-link">← Volver a pedidos</router-link>

    <div v-if="loading" class="spinner"></div>

    <div v-else-if="order" class="order-layout">
      <div class="order-header">
        <div>
          <h1 class="admin-title">{{ order.code }}</h1>
          <p class="muted">Creado el {{ formatDateTime(order.createdAt) }}</p>
        </div>
        <div class="header-badges">
          <span class="badge badge-lg" :class="`badge-${order.status.toLowerCase()}`">{{ STATUS_LABELS[order.status] }}</span>
          <span v-if="order.paymentMethod === 'TRANSFER'" class="badge badge-lg" :class="order.paymentStatus === 'PAID' ? 'badge-delivered' : 'badge-pending'">
            pago {{ order.paymentStatus === 'PAID' ? 'recibido' : 'pendiente' }}
          </span>
        </div>
      </div>

      <div class="admin-card status-card">
        <h2>Actualizar estado</h2>
        <div class="status-actions">
          <button
            v-for="s in nextStatuses"
            :key="s"
            class="btn btn-sm"
            :class="s === 'CANCELLED' ? 'btn-danger' : 'btn-primary'"
            @click="openConfirm(s)"
          >
            {{ STATUS_LABELS[s] }}
          </button>
        </div>
        <div class="form-group" style="margin-top: 12px; max-width: 420px">
          <label>Nota (opcional)</label>
          <input v-model="note" class="form-control" placeholder="Ej: cliente pidió llamar antes" />
        </div>
        <label class="check-label" style="margin-top: 8px; display: flex; gap: 8px; align-items: center; font-size: 0.88rem; font-weight: 600">
          <input v-model="paymentPaid" type="checkbox" />
          Marcar transferencia como pagada
        </label>
      </div>

      <div class="detail-grid">
        <div class="admin-card">
          <h2>Productos</h2>
          <div v-for="item in order.items" :key="item.id" class="item-row">
            <span>{{ item.name }} <small class="muted">× {{ item.quantity }} ({{ item.unit }})</small></span>
            <span>{{ money(item.price * item.quantity) }}</span>
          </div>
          <div class="totals">
            <div class="total-row"><span>Subtotal</span><span>{{ money(order.subtotal) }}</span></div>
            <div class="total-row"><span>Envío</span><span>{{ money(order.deliveryFee) }}</span></div>
            <div class="total-row grand"><span>Total</span><span>{{ money(order.total) }}</span></div>
          </div>
        </div>

        <div class="admin-card">
          <h2>Cliente</h2>
          <p class="detail-line"><strong>{{ order.user.name }}</strong></p>
          <p class="detail-line">{{ order.user.phone }}</p>
          <p v-if="order.user.email" class="detail-line muted">{{ order.user.email }}</p>

          <h2 class="sub-title">Entrega</h2>
          <p class="detail-line">{{ formatDateLong(order.deliveryDate) }} · {{ order.slotLabel }}</p>
          <p class="detail-line">{{ order.addressSnapshot.street }}{{ order.addressSnapshot.number ? ' ' + order.addressSnapshot.number : '' }}</p>
          <p v-if="order.addressSnapshot.reference" class="detail-line muted">{{ order.addressSnapshot.reference }}</p>
          <p class="detail-line muted">{{ order.addressSnapshot.city }}</p>
          <p v-if="order.notes" class="detail-line"><strong>Notas:</strong> {{ order.notes }}</p>
        </div>

        <div class="admin-card">
          <h2>Seguimiento</h2>
          <div class="timeline">
            <div v-for="ev in order.events" :key="ev.id" class="timeline-item">
              <div class="timeline-dot" :class="`badge-${ev.status.toLowerCase()}`"></div>
              <div>
                <p class="timeline-status">{{ STATUS_LABELS[ev.status] }}</p>
                <p class="timeline-meta muted">{{ formatDateTime(ev.createdAt) }}</p>
                <p v-if="ev.note" class="timeline-note">{{ ev.note }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state"><h3>Pedido no encontrado</h3></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../../api/client.js'
import { money, formatDateTime, formatDateLong, STATUS_LABELS } from '../../utils/format.js'

const route = useRoute()
const order = ref(null)
const loading = ref(true)
const note = ref('')
const paymentPaid = ref(false)

const statusOrder = ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']

const nextStatuses = computed(() => {
  if (!order.value) return []
  const idx = statusOrder.indexOf(order.value.status)
  if (idx >= 4) return [] // terminal
  return statusOrder.slice(idx + 1)
})

async function load() {
  loading.value = true
  try {
    const data = await api.get(`/api/admin/orders/${route.params.id}`)
    order.value = data.order
    paymentPaid.value = order.value.paymentStatus === 'PAID'
  } finally {
    loading.value = false
  }
}

async function openConfirm(status) {
  if (!confirm(`¿Cambiar el pedido ${order.value.code} a "${STATUS_LABELS[status]}"?`)) return
  try {
    await api.patch(`/api/admin/orders/${order.value.id}/status`, {
      status,
      note: note.value || undefined,
      ...(order.value.paymentMethod === 'TRANSFER' ? { paymentStatus: paymentPaid.value ? 'PAID' : 'PENDING' } : {}),
    })
    note.value = ''
    await load()
  } catch (err) {
    alert(err.message)
  }
}

onMounted(load)
</script>

<style scoped>
.back-link {
  display: inline-block;
  margin-bottom: 14px;
  color: var(--green-dark);
  font-weight: 600;
  font-size: 0.9rem;
}

.admin-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--green-dark);
  margin-bottom: 2px;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.header-badges {
  display: flex;
  gap: 8px;
}

.badge-lg {
  font-size: 0.85rem;
  padding: 8px 16px;
}

.status-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 10px 18px;
  font-size: 0.85rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 20px;
  align-items: start;
}

.sub-title {
  margin-top: 18px;
}

.item-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--gray-mid);
  font-size: 0.9rem;
}

.totals {
  margin-top: 12px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  padding: 4px 0;
}

.total-row.grand {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--green-dark);
  border-top: 1px solid var(--gray-mid);
  margin-top: 6px;
  padding-top: 10px;
}

.detail-line {
  font-size: 0.9rem;
  margin-bottom: 4px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-item {
  display: flex;
  gap: 12px;
}

.timeline-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.timeline-status {
  font-weight: 700;
  font-size: 0.88rem;
}

.timeline-meta {
  font-size: 0.76rem;
}

.timeline-note {
  font-size: 0.82rem;
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
