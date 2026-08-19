<template>
  <div class="page checkout-page">
    <div class="container">
      <h1 class="section-title">Finalizar pedido</h1>

      <div v-if="!loading" class="checkout-layout">
        <div class="checkout-main">
          <!-- Dirección -->
          <section class="checkout-section">
            <h2>1. Dirección de entrega</h2>

            <div v-if="addresses.length" class="address-list">
              <button
                v-for="addr in addresses"
                :key="addr.id"
                class="address-card"
                :class="{ active: selectedAddressId === addr.id }"
                @click="selectAddress(addr)"
              >
                <span class="address-label">{{ addr.label }} <span v-if="addr.isDefault" class="default-tag">default</span></span>
                <span class="address-street">{{ addr.street }}{{ addr.number ? ' ' + addr.number : '' }}, {{ addr.city }}</span>
                <span v-if="addr.reference" class="address-ref">{{ addr.reference }}</span>
              </button>
            </div>

            <button class="btn btn-outline btn-sm" @click="toggleNewAddress">
              {{ addressMode === 'new' ? 'Usar dirección guardada' : '+ Agregar nueva dirección' }}
            </button>

            <div v-if="addressMode === 'new'" class="new-address">
              <div class="form-group">
                <label>Ubicación en el mapa</label>
                <MapPicker v-model="newAddress" />
              </div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Etiqueta</label>
                  <input v-model="newAddress.label" class="form-control" placeholder="Casa / Trabajo" />
                </div>
                <div class="form-group">
                  <label>Calle</label>
                  <input v-model="newAddress.street" class="form-control" />
                </div>
                <div class="form-group">
                  <label>Número</label>
                  <input v-model="newAddress.number" class="form-control" />
                </div>
                <div class="form-group">
                  <label>Ciudad</label>
                  <input v-model="newAddress.city" class="form-control" />
                </div>
              </div>
              <div class="form-group">
                <label>Referencia</label>
                <input v-model="newAddress.reference" class="form-control" placeholder="Frente al parque, junto a…" />
              </div>
            </div>

            <div v-if="deliveryCheck" class="fee-banner" :class="{ out: !deliveryCheck.withinZone }">
              <template v-if="deliveryCheck.withinZone">
                <strong>{{ deliveryCheck.zoneName }}</strong> · {{ deliveryCheck.distanceKm }} km · Envío {{ money(deliveryCheck.deliveryFee) }}
              </template>
              <template v-else>
                Fuera de la zona de entrega ({{ deliveryCheck.distanceKm }} km)
              </template>
            </div>
          </section>

          <!-- Entrega -->
          <section class="checkout-section">
            <h2>2. Cuándo quieres tu entrega</h2>
            <DeliverySlotPicker :zone-id="deliveryCheck?.zoneId || null" @update="onSlotUpdate" />
          </section>

          <!-- Pago -->
          <section class="checkout-section">
            <h2>3. Método de pago</h2>
            <div class="payment-options">
              <button class="payment-card" :class="{ active: payment === 'COD' }" @click="payment = 'COD'">
                <strong>Contra reembolso</strong>
                <span class="muted">Pagas al recibir, en efectivo</span>
              </button>
              <button class="payment-card" :class="{ active: payment === 'TRANSFER' }" @click="payment = 'TRANSFER'">
                <strong>Transferencia</strong>
                <span class="muted">Pago a cuenta bancaria</span>
              </button>
            </div>

            <div v-if="payment === 'TRANSFER' && settings.settings?.bankTransfer" class="bank-info">
              <p><strong>{{ settings.settings.bankTransfer.bank }}</strong></p>
              <p>Titular: {{ settings.settings.bankTransfer.accountName }}</p>
              <p>Cuenta {{ settings.settings.bankTransfer.accountType }}: {{ settings.settings.bankTransfer.accountNumber }}</p>
              <p class="muted">{{ settings.settings.bankTransfer.note }}</p>
            </div>
          </section>

          <!-- Facturación -->
          <section v-if="settings.settings?.sriEnabled" class="checkout-section">
            <h2>4. Facturación</h2>

            <div class="payment-options">
              <button class="payment-card" :class="{ active: billing.type === 'CONSUMO_FINAL' }" @click="setBillingType('CONSUMO_FINAL')">
                <strong>Consumo final</strong>
                <span class="muted">Tiquete sin datos fiscales</span>
              </button>
              <button class="payment-card" :class="{ active: billing.type === 'FACTURA' }" @click="setBillingType('FACTURA')">
                <strong>Factura con RUC</strong>
                <span class="muted">Documento electrónico autorizado por el SRI</span>
              </button>
            </div>

            <div v-if="billing.type === 'FACTURA'" class="billing-form">
              <div class="form-grid">
                <div class="form-group">
                  <label>Tipo de identificación</label>
                  <select v-model="billing.idType" class="form-control">
                    <option value="RUC">RUC</option>
                    <option value="CEDULA">Cédula</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>{{ billing.idType === 'RUC' ? 'RUC' : 'Cédula' }}</label>
                  <input v-model="billing.id" class="form-control" :maxlength="billing.idType === 'RUC' ? 13 : 10" placeholder="Sin guiones" />
                  <p v-if="billing.id && !idValid" class="error-msg">{{ billing.idType === 'RUC' ? 'El RUC no es válido' : 'La cédula no es válida' }}</p>
                </div>
                <div class="form-group">
                  <label>Razón social / Nombre</label>
                  <input v-model="billing.name" class="form-control" />
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input v-model="billing.email" type="email" class="form-control" />
                </div>
              </div>
              <div class="form-group">
                <label>Dirección</label>
                <input v-model="billing.address" class="form-control" />
              </div>
            </div>
          </section>

          <!-- Notas -->
          <section class="checkout-section">
            <h2>5. Notas (opcional)</h2>
            <textarea v-model="notes" class="form-control" rows="3" placeholder="Ej: sin cebolla, llamar al llegar…"></textarea>
          </section>
        </div>

        <!-- Resumen -->
        <aside class="checkout-summary">
          <h2>Resumen</h2>
          <div class="summary-items">
            <div v-for="item in cart.items" :key="item.productId" class="summary-item">
              <span>{{ item.name }} × {{ item.quantity }}</span>
              <span>{{ money(item.price * item.quantity) }}</span>
            </div>
          </div>
          <div class="summary-row"><span>Subtotal</span><span>{{ money(cart.subtotal) }}</span></div>
          <div class="summary-row"><span>Envío</span><span>{{ money(estimatedFee) }}</span></div>
          <div class="summary-row total"><span>Total</span><span>{{ money(cart.subtotal + estimatedFee) }}</span></div>

          <p v-if="error" class="error-msg">{{ error }}</p>
          <button class="btn btn-primary btn-block" :disabled="!canSubmit || submitting" @click="submit">
            {{ submitting ? 'Creando pedido…' : 'Confirmar pedido' }}
          </button>
          <p v-if="!canSubmit" class="muted submit-hint">
            {{ submitHint }}
          </p>
        </aside>
      </div>

      <div v-else class="spinner"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useCartStore } from '../stores/cart.js'
import { useSettingsStore } from '../stores/settings.js'
import { money } from '../utils/format.js'
import MapPicker from '../components/MapPicker.vue'
import DeliverySlotPicker from '../components/DeliverySlotPicker.vue'

const router = useRouter()
const cart = useCartStore()
const settings = useSettingsStore()

const loading = ref(true)
const addresses = ref([])
const selectedAddressId = ref(null)
const addressMode = ref('new')
const newAddress = ref({ label: '', street: '', number: '', reference: '', city: 'Guayaquil', lat: null, lng: null })
const delivery = ref(null)
const payment = ref('COD')
const notes = ref('')
const deliveryCheck = ref(null)
const error = ref('')
const submitting = ref(false)
const billing = ref({ type: 'CONSUMO_FINAL', idType: 'RUC', id: '', name: '', address: '', email: '' })

const estimatedFee = computed(() => (deliveryCheck.value?.withinZone ? deliveryCheck.value.deliveryFee : 0))

const wantsInvoice = computed(() => settings.settings?.sriEnabled === true && billing.value.type === 'FACTURA')

const idValid = computed(() => !billing.value.id || validateIdentifier(billing.value.id, billing.value.idType))

const billingValid = computed(() => {
  if (!wantsInvoice.value) return true
  return idValid.value && billing.value.id && billing.value.name.trim().length >= 2
})

const canSubmit = computed(() => {
  if (cart.items.length === 0) return false
  if (!activeAddressValid.value) return false
  if (!delivery.value) return false
  if (wantsInvoice.value && !billingValid.value) return false
  return true
})

const submitHint = computed(() => {
  if (cart.items.length === 0) return 'Tu carrito está vacío'
  if (!activeAddressValid.value) return 'Selecciona una dirección dentro de una zona de entrega'
  if (!delivery.value) return 'Elige fecha y horario de entrega'
  if (wantsInvoice.value && !billingValid.value) return 'Completa los datos de facturación'
  return ''
})

function setBillingType(type) {
  billing.value.type = type
}

const activeAddressValid = computed(() => {
  if (addressMode.value === 'existing') {
    return selectedAddressId.value !== null
  }
  const a = newAddress.value
  return a.lat !== null && a.lng !== null && a.withinZone === true && a.street && a.city
})

async function loadAddresses() {
  try {
    const data = await api.get('/api/addresses')
    addresses.value = data.addresses
    const def = data.addresses.find((a) => a.isDefault)
    if (def) {
      selectedAddressId.value = def.id
      addressMode.value = 'existing'
      selectAddress(def)
    } else if (data.addresses.length) {
      selectedAddressId.value = data.addresses[0].id
      addressMode.value = 'existing'
      selectAddress(data.addresses[0])
    }
  } catch {
    addresses.value = []
  }
}

async function selectAddress(addr) {
  selectedAddressId.value = addr.id
  addressMode.value = 'existing'
  const check = await api.get('/api/delivery/check', { lat: addr.lat, lng: addr.lng })
  deliveryCheck.value = check
}

function toggleNewAddress() {
  addressMode.value = addressMode.value === 'new' ? 'existing' : 'new'
  if (addressMode.value === 'new') deliveryCheck.value = null
  else if (selectedAddressId.value) {
    const addr = addresses.value.find((a) => a.id === selectedAddressId.value)
    if (addr) selectAddress(addr)
  }
}

function onSlotUpdate(val) {
  delivery.value = val
}

function validateIdentifier(identifier, type) {
  const r = String(identifier || '').replace(/\D/g, '')
  if (type === 'RUC') {
    if (r.length !== 13) return false
    const third = Number(r[2])
    if (third === 9) {
      const weights = [4, 3, 2, 7, 6, 5, 4, 3, 2]
      const sum = r.slice(0, 9).split('').reduce((a, d, i) => a + Number(d) * weights[i], 0)
      const check = 11 - (sum % 11)
      const dv = check === 11 ? 0 : check === 10 ? 1 : check
      return dv === Number(r[9]) && Number(r.slice(10)) >= 1
    }
    if (third === 6) {
      const weights = [3, 2, 7, 6, 5, 4, 3, 2]
      const sum = r.slice(0, 8).split('').reduce((a, d, i) => a + Number(d) * weights[i], 0)
      const check = 11 - (sum % 11)
      const dv = check === 11 ? 0 : check === 10 ? 1 : check
      return dv === Number(r[8])
    }
    if (third >= 0 && third <= 5) {
      const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2]
      let sum = 0
      for (let i = 0; i < 9; i += 1) {
        const prod = Number(r[i]) * weights[i]
        sum += prod >= 10 ? prod - 9 : prod
      }
      const mod = sum % 10
      const dv = mod === 0 ? 0 : 10 - mod
      return dv === Number(r[9])
    }
    return false
  }
  if (type === 'CEDULA') {
    if (r.length !== 10) return false
    const province = Number(r.slice(0, 2))
    if (province < 1 || province > 24) return false
    const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    let sum = 0
    for (let i = 0; i < 9; i += 1) {
      const prod = Number(r[i]) * weights[i]
      sum += prod >= 10 ? prod - 9 : prod
    }
    const mod = sum % 10
    const dv = mod === 0 ? 0 : 10 - mod
    return dv === Number(r[9])
  }
  return false
}

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    let body
    if (addressMode.value === 'existing') {
      body = { addressId: selectedAddressId.value }
    } else {
      const addr = { ...newAddress.value }
      if (!addr.label) addr.label = addr.street || 'Casa'
      if (!addr.street) addr.street = 'Dirección'
      body = { address: addr }
    }
    body.deliveryDate = delivery.value.date
    body.slotId = delivery.value.slotId
    body.paymentMethod = payment.value
    body.notes = notes.value || ''
    body.items = cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
    if (settings.settings?.sriEnabled && billing.value.type === 'FACTURA') {
      body.billing = {
        type: 'FACTURA',
        idType: billing.value.idType,
        id: String(billing.value.id || '').replace(/\D/g, ''),
        name: billing.value.name.trim(),
        address: billing.value.address.trim(),
        email: billing.value.email.trim(),
      }
    }

    const data = await api.post('/api/orders', body)
    cart.clear()
    router.push({ name: 'order-detail', params: { id: data.order.id } })
  } catch (err) {
    error.value = err.message
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await settings.load()
  await loadAddresses()
  loading.value = false
})
</script>

<style scoped>
.checkout-page .section-title {
  color: var(--dark);
}

.checkout-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 32px;
  align-items: start;
}

.checkout-section {
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius);
  padding: 24px;
  margin-bottom: 20px;
}

.checkout-section h2,
.checkout-summary h2 {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--dark);
  margin-bottom: 16px;
}

.address-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.address-card {
  text-align: left;
  padding: 14px 16px;
  border: 1.5px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  background: white;
  transition: var(--transition);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.address-card.active {
  border-color: var(--green-dark);
  background: var(--green-light);
  background: rgba(76, 175, 80, 0.08);
}

.address-label {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--dark);
}

.default-tag {
  font-size: 0.68rem;
  background: var(--green-light);
  color: white;
  padding: 2px 8px;
  border-radius: 50px;
  margin-left: 6px;
  vertical-align: middle;
}

.address-street {
  font-size: 0.85rem;
  color: var(--dark);
}

.address-ref {
  font-size: 0.8rem;
  color: var(--gray);
}

.btn-sm {
  padding: 9px 18px;
  font-size: 0.85rem;
}

.new-address {
  margin-top: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.fee-banner {
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: #E8F5E9;
  color: var(--green-mid);
  font-weight: 600;
  font-size: 0.88rem;
}

.fee-banner.out {
  background: #FFEBEE;
  color: var(--red);
}

.payment-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.payment-card {
  text-align: left;
  padding: 16px;
  border: 1.5px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  background: white;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: var(--transition);
}

.payment-card.active {
  border-color: var(--green-dark);
  background: rgba(76, 175, 80, 0.08);
}

.payment-card strong {
  color: var(--dark);
}

.payment-card span {
  font-size: 0.8rem;
}

.bank-info {
  background: var(--gray-light);
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  line-height: 1.8;
}

.billing-form {
  margin-top: 16px;
}

.checkout-summary {
  position: sticky;
  top: 88px;
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow);
}

.summary-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--gray-mid);
}

.summary-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.88rem;
  color: var(--dark);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.92rem;
  margin-bottom: 8px;
}

.summary-row.total {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--green-dark);
  border-top: 1px solid var(--gray-mid);
  padding-top: 12px;
  margin-top: 4px;
}

.submit-hint {
  text-align: center;
  font-size: 0.8rem;
  margin-top: 10px;
}

@media (max-width: 900px) {
  .checkout-layout {
    grid-template-columns: 1fr;
  }

  .checkout-summary {
    position: static;
  }
}

@media (max-width: 480px) {
  .form-grid,
  .payment-options {
    grid-template-columns: 1fr;
  }
}
</style>
