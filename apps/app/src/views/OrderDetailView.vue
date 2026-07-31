<template>
  <div class="page">
    <div class="container">
      <router-link to="/pedidos" class="back-link">← Volver a mis pedidos</router-link>

      <div v-if="loading" class="spinner"></div>

      <div v-else-if="order" class="order-detail">
        <div class="order-header">
          <div>
            <h1 class="section-title">{{ order.code }}</h1>
            <p class="muted">Pedido del {{ formatDateTime(order.createdAt) }}</p>
          </div>
          <span class="badge badge-lg" :class="`badge-${order.status.toLowerCase()}`">{{ STATUS_LABELS[order.status] }}</span>
        </div>

        <div v-if="order.status === 'PENDING' || order.status === 'CONFIRMED'" class="cancel-box">
          <p class="muted">¿Necesitas cancelar este pedido?</p>
          <button class="btn btn-danger" @click="cancel">Cancelar pedido</button>
        </div>

        <div class="detail-grid">
          <div class="detail-card">
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

          <div class="detail-card">
            <h2>Entrega</h2>
            <p class="detail-line"><strong>Fecha:</strong> {{ formatDateLong(order.deliveryDate) }}</p>
            <p class="detail-line"><strong>Horario:</strong> {{ order.slotLabel }}</p>
            <h2 class="sub-title">Dirección</h2>
            <p class="detail-line">{{ order.addressSnapshot.street }}{{ order.addressSnapshot.number ? ' ' + order.addressSnapshot.number : '' }}</p>
            <p v-if="order.addressSnapshot.reference" class="detail-line muted">{{ order.addressSnapshot.reference }}</p>
            <p class="detail-line muted">{{ order.addressSnapshot.city }}</p>

            <h2 class="sub-title">Pago</h2>
            <p class="detail-line"><strong>{{ PAYMENT_LABELS[order.paymentMethod] }}</strong></p>
            <div v-if="order.paymentMethod === 'TRANSFER' && settings.settings?.bankTransfer" class="bank-info">
              <p>{{ settings.settings.bankTransfer.bank }} · {{ settings.settings.bankTransfer.accountType }}</p>
              <p>{{ settings.settings.bankTransfer.accountName }}</p>
              <p class="muted">{{ settings.settings.bankTransfer.accountNumber }}</p>
            </div>
            <p v-if="order.notes" class="detail-line"><strong>Notas:</strong> {{ order.notes }}</p>
          </div>

          <div class="detail-card">
            <h2>Seguimiento</h2>
            <div class="timeline">
              <div v-for="ev in [...order.events].reverse()" :key="ev.id" class="timeline-item">
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

      <div v-else class="empty-state">
        <h3>Pedido no encontrado</h3>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import { useSettingsStore } from '../stores/settings.js'
import { money, formatDateLong, formatDateTime, STATUS_LABELS, PAYMENT_LABELS } from '../utils/format.js'

const route = useRoute()
const settings = useSettingsStore()
const order = ref(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const data = await api.get(`/api/orders/${route.params.id}`)
    order.value = data.order
  } finally {
    loading.value = false
  }
}

async function cancel() {
  if (!confirm(`¿Cancelar el pedido ${order.value.code}?`)) return
  try {
    await api.post(`/api/orders/${order.value.id}/cancel`)
    await load()
  } catch {
    // noop
  }
}

onMounted(async () => {
  await settings.load()
  await load()
})
</script>

<style scoped>
.back-link {
  display: inline-block;
  margin-bottom: 16px;
  color: var(--green-dark);
  font-weight: 600;
  font-size: 0.9rem;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.badge-lg {
  font-size: 0.9rem;
  padding: 8px 18px;
}

.cancel-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #FFF8E1;
  border: 1px solid #FFE082;
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 20px;
  align-items: start;
}

.detail-card {
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius);
  padding: 22px;
}

.detail-card h2 {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--green-dark);
  margin-bottom: 12px;
}

.sub-title {
  margin-top: 20px;
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

.bank-info {
  background: var(--gray-light);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 0.85rem;
  margin-top: 6px;
  margin-bottom: 10px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline-item {
  display: flex;
  gap: 12px;
  position: relative;
}

.timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.timeline-status {
  font-weight: 700;
  font-size: 0.9rem;
}

.timeline-meta {
  font-size: 0.78rem;
}

.timeline-note {
  font-size: 0.82rem;
  color: var(--dark);
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
