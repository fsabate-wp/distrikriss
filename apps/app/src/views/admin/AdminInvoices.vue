<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Facturas electrónicas</h1>
        <p class="muted admin-sub">{{ invoices.length }} comprobante(s)</p>
      </div>
    </div>

    <div v-if="loading" class="spinner"></div>

    <div v-else class="admin-card" style="padding: 0">
      <table class="admin-table">
        <thead>
          <tr><th>Factura</th><th>Clave de acceso</th><th>Estado</th><th>Pedido</th><th>Total</th><th>Fecha</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-if="invoices.length === 0"><td colspan="7" class="empty-cell">Sin facturas aún. Los comprobantes se generan al confirmar pedidos con factura.</td></tr>
          <tr v-for="inv in invoices" :key="inv.id">
            <td class="num-cell">{{ inv.number }}</td>
            <td class="mono muted">{{ inv.accessKey }}</td>
            <td><span class="badge" :class="`badge-${inv.status.toLowerCase()}`">{{ INVOICE_STATUS_LABELS[inv.status] || inv.status }}</span></td>
            <td>
              <router-link v-if="inv.order" :to="`/admin/pedidos/${inv.orderId}`" class="code-link">{{ inv.order.code }}</router-link>
              <span v-else class="muted">—</span>
            </td>
            <td>{{ inv.order ? money(inv.order.total) : '—' }}</td>
            <td class="muted">{{ formatDateTime(inv.createdAt) }}</td>
            <td class="actions-cell">
              <button class="action-link" @click="openDetail(inv.id)">Ver</button>
              <button v-if="!isFinal(inv.status)" class="action-link" :disabled="retryingId === inv.id" @click="retry(inv)">
                {{ retryingId === inv.id ? 'Reenviando…' : 'Reintentar' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="detail" class="modal-overlay" @click.self="detail = null">
      <div class="modal">
        <div class="modal-header">
          <h2>Factura {{ detail.number }}</h2>
          <button class="close-btn" @click="detail = null">✕</button>
        </div>
        <div class="modal-body">
          <p><strong>Estado:</strong> <span class="badge" :class="`badge-${detail.status.toLowerCase()}`">{{ INVOICE_STATUS_LABELS[detail.status] || detail.status }}</span></p>
          <p class="mono"><strong>Clave de acceso:</strong> {{ detail.accessKey }}</p>
          <p v-if="detail.authorizationNumber"><strong>Nro. autorización:</strong> {{ detail.authorizationNumber }}</p>
          <p v-if="detail.authorizationDate"><strong>Fecha autorización:</strong> {{ formatDateTime(detail.authorizationDate) }}</p>
          <p v-if="detail.responseCode"><strong>Código:</strong> {{ detail.responseCode }}</p>
          <p v-if="detail.responseMessage" class="muted">{{ detail.responseMessage }}</p>
          <p v-if="detail.order"><strong>Pedido:</strong> {{ detail.order.code }} · {{ money(detail.order.total) }}</p>
          <p v-if="detail.xml" class="muted mono xml-preview">{{ detail.xml.slice(0, 400) }}{{ detail.xml.length > 400 ? '…' : '' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api/client.js'
import { money, formatDateTime, INVOICE_STATUS_LABELS } from '../../utils/format.js'

const invoices = ref([])
const loading = ref(true)
const detail = ref(null)
const retryingId = ref(null)

const isFinal = (status) => status === 'AUTHORIZED'

async function load() {
  loading.value = true
  try {
    const data = await api.get('/api/admin/invoices')
    invoices.value = data.invoices
  } finally {
    loading.value = false
  }
}

async function openDetail(id) {
  try {
    const data = await api.get(`/api/admin/invoices/${id}`)
    detail.value = data.invoice
  } catch (err) {
    alert(err.message)
  }
}

async function retry(inv) {
  if (!confirm(`¿Reintentar el envío de la factura ${inv.number} al SRI?`)) return
  retryingId.value = inv.id
  try {
    await api.post(`/api/admin/invoices/${inv.id}/retry`, {})
    await load()
  } catch (err) {
    alert(err.message)
  } finally {
    retryingId.value = null
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

.num-cell {
  font-weight: 700;
  white-space: nowrap;
}

.mono {
  font-family: monospace;
  font-size: 0.78rem;
  word-break: break-all;
}

.code-link {
  color: var(--green-dark);
  font-weight: 700;
  text-decoration: none;
}

.actions-cell {
  text-align: right;
  white-space: nowrap;
}

.action-link {
  background: none;
  border: none;
  color: var(--green-dark);
  font-weight: 600;
  font-size: 0.85rem;
  margin-left: 10px;
  cursor: pointer;
}

.action-link:disabled {
  color: var(--gray);
  cursor: default;
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
  max-width: 560px;
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
  font-size: 0.9rem;
}

.modal-body p {
  margin-bottom: 8px;
}

.xml-preview {
  margin-top: 12px;
  padding: 10px;
  background: var(--gray-light);
  border-radius: var(--radius-sm);
}
</style>
