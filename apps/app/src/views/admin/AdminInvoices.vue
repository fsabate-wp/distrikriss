<template>
  <div>
    <div class="admin-toolbar">
      <div>
        <h1 class="admin-title">Facturas electrónicas</h1>
        <p class="muted admin-sub">{{ total }} comprobante(s)</p>
      </div>
      <div v-if="health" class="health-strip">
        <span
          v-for="b in summary"
          :key="b.status"
          class="health-chip"
          :class="b.tone"
          :title="b.hint"
        >
          {{ b.label }}: {{ b.count }}
        </span>
      </div>
    </div>

    <div v-if="loading" class="spinner"></div>

    <div v-else-if="error" class="admin-card"><p class="error-msg">{{ error }}</p></div>

    <div v-else-if="invoices.length === 0" class="admin-card empty-card">
      <p class="muted">
        Sin facturas todavía. Se generan cuando el pago de un pedido con RUC se confirma, no al crear el pedido.
      </p>
    </div>

    <div v-else class="admin-card" style="padding: 0">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Comprobante</th>
            <th>Clave de acceso</th>
            <th>Estado</th>
            <th>Pedido</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in invoices" :key="inv.id">
            <td class="num-cell">
              {{ inv.number }}
              <span v-if="inv.environment !== 1" class="test-badge">PRUEBAS</span>
              <span v-if="inv.docType === 'NOTA_CREDITO'" class="credit-badge">NC</span>
            </td>
            <td class="mono muted">{{ inv.accessKey }}</td>
            <td>
              <span class="badge" :class="statusClass(inv.status)">{{ INVOICE_STATUS_LABELS[inv.status] || inv.status }}</span>
              <p v-if="isProblem(inv.status) && inv.responseMessage" class="muted err-hint">
                {{ inv.responseMessage.slice(0, 90) }}
              </p>
            </td>
            <td>
              <router-link v-if="inv.order" :to="`/admin/pedidos/${inv.orderId}`" class="code-link">{{ inv.order.code }}</router-link>
              <span v-else class="muted">—</span>
            </td>
            <td>{{ money(inv.totalFiscal) }}</td>
            <td class="actions-cell">
              <button class="action-link" @click="openDetail(inv.id)">Ver</button>
              <button
                v-if="canRetry(inv)"
                class="action-link"
                :disabled="busyId === inv.id"
                @click="retry(inv)"
              >
                {{ busyId === inv.id ? 'Reintentando…' : 'Reintentar' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="detail" class="modal-overlay" @click.self="detail = null">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ detail.number }}</h2>
          <button class="close-btn" @click="detail = null">✕</button>
        </div>
        <div class="modal-body">
          <p>
            <strong>Estado:</strong>
            <span class="badge" :class="statusClass(detail.status)">{{ INVOICE_STATUS_LABELS[detail.status] || detail.status }}</span>
          </p>
          <p v-if="detail.docType === 'NOTA_CREDITO'" class="muted">Es una nota de crédito.</p>
          <p class="mono"><strong>Clave de acceso:</strong> {{ detail.accessKey }}</p>
          <p v-if="detail.authorizationNumber"><strong>Nro. autorización:</strong> {{ detail.authorizationNumber }}</p>
          <p v-if="detail.authorizationDate"><strong>Fecha autorización:</strong> {{ formatDateTime(detail.authorizationDate) }}</p>
          <p v-if="detail.responseCode"><strong>Código SRI:</strong> {{ detail.responseCode }}</p>
          <p v-if="detail.responseMessage" class="muted">{{ detail.responseMessage }}</p>
          <p v-if="detail.retryCount > 0"><strong>Reintentos:</strong> {{ detail.retryCount }}</p>
          <p v-if="detail.order"><strong>Pedido:</strong> {{ detail.order.code }} · {{ money(detail.totalFiscal) }}</p>

          <div class="modal-actions">
            <button class="btn btn-outline btn-sm" :disabled="!detail.xml" @click="downloadXml(detail)">
              Descargar XML
            </button>
            <button class="btn btn-outline btn-sm" :disabled="busyId === detail.id" @click="downloadRide(detail)">
              Descargar RIDE (PDF)
            </button>
            <button
              v-if="canCreditNote(detail)"
              class="btn btn-danger btn-sm"
              :disabled="busyId === detail.id"
              @click="askCreditNote(detail)"
            >
              Emitir nota de crédito
            </button>
            <button v-if="canRetry(detail)" class="btn btn-outline btn-sm" :disabled="busyId === detail.id" @click="retry(detail)">
              Reintentar envío
            </button>
          </div>

          <details v-if="detail.events && detail.events.length" class="timeline">
            <summary>Historial ({{ detail.events.length }})</summary>
            <ul>
              <li v-for="e in detail.events" :key="e.id">
                <strong>{{ formatDateTime(e.createdAt) }}</strong> · {{ e.event }}
                <span v-if="e.detail" class="muted"> — {{ e.detail }}</span>
              </li>
            </ul>
          </details>

          <details v-if="detail.credits && detail.credits.length" class="timeline">
            <summary>Notas de crédito ({{ detail.credits.length }})</summary>
            <ul>
              <li v-for="c in detail.credits" :key="c.id">
                {{ c.number }} · {{ INVOICE_STATUS_LABELS[c.status] || c.status }}
                <button class="action-link" @click="openDetail(c.id)">ver</button>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../api/client.js'
import {
  money,
  formatDateTime,
  INVOICE_STATUS_LABELS,
  INVOICE_TERMINAL_STATUSES,
  INVOICE_PROBLEM_STATUSES,
} from '../../utils/format.js'

const invoices = ref([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const detail = ref(null)
const busyId = ref(null)
const health = ref(null)

const isProblem = (status) => INVOICE_PROBLEM_STATUSES.includes(status)

/**
 * Reintentar tiene sentido solo si el SRI todavía no dio una respuesta
 * definitiva. Un comprobante ya autorizado, rechazado o no autorizado tiene su
 * clave registrada: reenviarlo no cambia nada y el botón engaña.
 */
const canRetry = (inv) => !INVOICE_TERMINAL_STATUSES.includes(inv.status)

const canCreditNote = (inv) => inv.status === 'AUTHORIZED' && !inv.credits?.length

const statusClass = (status) => `badge-${String(status || '').toLowerCase().replace(/_/g, '-')}`

const summary = computed(() => {
  const byStatus = health.value?.byStatus || []
  const totalCount = byStatus.reduce((a, s) => a + s.count, 0)
  const chips = []
  const auth = byStatus.find((s) => s.status === 'AUTHORIZED')?.count || 0
  const problems = byStatus
    .filter((s) => INVOICE_PROBLEM_STATUSES.includes(s.status))
    .reduce((a, s) => a + s.count, 0)
  const pending = totalCount - auth - problems
  chips.push({ status: 'AUTHORIZED', label: 'Autorizadas', count: auth, tone: 'ok', hint: 'Válidas ante el SRI' })
  chips.push({ status: 'PENDING', label: 'En curso', count: pending, tone: 'warn', hint: 'Firmadas o recibidas sin resolver' })
  chips.push({ status: 'PROBLEM', label: 'Con problemas', count: problems, tone: 'bad', hint: 'Requieren acción' })
  return chips
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [data, h] = await Promise.all([
      api.get('/api/admin/invoices'),
      api.get('/api/admin/sri/health').catch(() => null),
    ])
    invoices.value = data.invoices
    total.value = data.total
    health.value = h
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function openDetail(id) {
  try {
    const data = await api.get(`/api/admin/invoices/${id}`)
    detail.value = data.invoice
  } catch (err) {
    error.value = err.message
  }
}

async function retry(inv) {
  if (!confirm(`¿Reintentar el envío de ${inv.number} al SRI?`)) return
  busyId.value = inv.id
  try {
    const res = await api.post(`/api/admin/invoices/${inv.id}/retry`, {})
    if (res.invoice?.responseMessage && res.invoice.status !== 'AUTHORIZED') {
      alert(`El SRI respondió: ${res.invoice.responseMessage}`)
    }
    await load()
    if (detail.value?.id === inv.id) await openDetail(inv.id)
  } catch (err) {
    alert(err.message)
  } finally {
    busyId.value = null
  }
}

/**
 * La nota de crédito pide confirmación de contraseña: el cliente de la API la
 * solicita automáticamente y repite la petición al recibir el 428 del servidor.
 */
async function askCreditNote(inv) {
  const reason = prompt(
    `Motivo de la anulación de ${inv.number}.\n` +
      'Se emitirá una nota de crédito ante el SRI. El motivo queda registrado en el comprobante.',
  )
  if (!reason || reason.trim().length < 5) return
  if (!confirm(`¿Confirmas la anulación de ${inv.number}? Esta acción genera un comprobante ante el SRI.`)) return
  busyId.value = inv.id
  try {
    await api.post(`/api/admin/invoices/${inv.id}/credit-note`, { reason: reason.trim() })
    await load()
    await openDetail(inv.id)
  } catch (err) {
    alert(err.message)
  } finally {
    busyId.value = null
  }
}

async function downloadXml(inv) {
  try {
    await api.download(`/api/admin/invoices/${inv.id}/xml`, `${inv.number}.xml`)
  } catch (err) {
    alert(err.message)
  }
}

async function downloadRide(inv) {
  busyId.value = inv.id
  try {
    await api.download(`/api/admin/invoices/${inv.id}/ride`, `${inv.number}.pdf`)
  } catch (err) {
    alert(err.message)
  } finally {
    busyId.value = null
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

.health-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.health-chip {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--gray-light);
}

.health-chip.ok {
  background: #e8f5e9;
  color: #1b5e20;
}

.health-chip.warn {
  background: #fff3e0;
  color: #e65100;
}

.health-chip.bad {
  background: #ffebee;
  color: #c62828;
}

.num-cell {
  font-weight: 700;
  white-space: nowrap;
}

.test-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #fff3e0;
  color: #e65100;
  font-size: 0.62rem;
  font-weight: 800;
}

.credit-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #e3f2fd;
  color: #1565c0;
  font-size: 0.62rem;
  font-weight: 800;
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

.err-hint {
  font-size: 0.72rem;
  margin: 2px 0 0;
  color: #c62828;
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

.empty-card {
  text-align: center;
  padding: 40px;
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
  max-width: 620px;
  max-height: 85vh;
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
  cursor: pointer;
}

.modal-body {
  padding: 18px 22px;
  font-size: 0.9rem;
}

.modal-body p {
  margin-bottom: 8px;
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--gray-mid);
}

.timeline {
  margin-top: 16px;
  font-size: 0.82rem;
}

.timeline summary {
  cursor: pointer;
  color: var(--green-dark);
  font-weight: 600;
}

.timeline ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.timeline li {
  margin-bottom: 4px;
}
</style>
