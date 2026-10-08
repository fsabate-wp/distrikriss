<template>
  <div class="page checkout-page">
    <div class="container">
      <h1 class="section-title">Finalizar pedido</h1>

      <div v-if="!loading" class="checkout-layout">
        <div class="checkout-main">
<!-- Aviso de cobertura: solo cuando el cliente aún no ha elegido dirección,
         para que sepa si le llegamos antes de armar el pedido. -->
        <CoverageChecker
          v-if="!hasAddress"
          @resultado="onCoverageResult"
        />

        <!-- Dirección -->
        <section class="checkout-section">
          <h2>1. Dirección de entrega</h2>

          <div v-if="hasAddress && deliveryCheck" class="fee-banner" :class="{ out: !deliveryCheck.withinZone }">
            <template v-if="deliveryCheck.withinZone">
              <strong>{{ deliveryCheck.zoneName }}</strong> · {{ deliveryCheck.distanceKm }} km · Envío {{ money(deliveryCheck.deliveryFee) }}
            </template>
            <template v-else>
              <strong>No cubrimos esta dirección</strong>
              <span class="muted">
                · Estás a {{ deliveryCheck.distanceKm }} km de la tienda
                <template v-if="deliveryCheck.nearestZoneKm != null && deliveryCheck.nearestZoneKm < 5">
                  · a {{ Math.round(deliveryCheck.nearestZoneKm * 10) / 10 }} km de {{ deliveryCheck.nearestZoneName }}
                </template>
              </span>
            </template>
          </div>

        <div v-if="deliveryChecking" class="fee-banner loading">
          <span class="muted">Comprobando la cobertura…</span>
        </div>

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
              <span>{{ item.name }} × {{ formatQty(item.quantity) }} {{ item.unit }}<span v-if="item.presentation" class="muted"> · {{ item.presentation }}</span></span>
              <span>{{ money(item.price * item.quantity) }}</span>
            </div>
          </div>
          <div class="summary-row"><span>Subtotal <small class="summary-iva">IVA incluido</small></span><span>{{ money(cart.subtotal) }}</span></div>
          <div class="summary-row"><span>Envío</span><span>{{ money(estimatedFee) }}</span></div>
          <div class="summary-row total"><span>Total</span><span>{{ money(cart.subtotal + estimatedFee) }}</span></div>

          <p v-if="aviso" class="aviso-msg">{{ aviso }}</p>
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
import { money, discountedPrice } from '../utils/format.js'
import MapPicker from '../components/MapPicker.vue'
import DeliverySlotPicker from '../components/DeliverySlotPicker.vue'
import CoverageChecker from '../components/CoverageChecker.vue'

const router = useRouter()
const cart = useCartStore()
const settings = useSettingsStore()

function formatQty(v) {
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

const loading = ref(true)
const addresses = ref([])
const selectedAddressId = ref(null)
const addressMode = ref('new')
const newAddress = ref({ label: '', street: '', number: '', reference: '', city: 'Guayaquil', lat: null, lng: null })
const delivery = ref(null)
const payment = ref('COD')
const notes = ref('')
const deliveryCheck = ref(null)
// La cobertura se comprueba al elegir dirección. Antes no había estado de
// carga: el botón quedaba habilitado durante la consulta y, si fallaba, el
// cliente discoverría el problema al confirmar.
const deliveryChecking = ref(false)

/** ¿Hay ya una dirección elegida (guardada o nueva con pin)? */
const hasAddress = computed(() => {
  if (addressMode.value === 'existing') return Boolean(selectedAddressId.value)
  return newAddress.value.lat !== null && newAddress.value.lng !== null
})

/** ¿La dirección elegida está dentro de alguna zona? null = sin comprobar. */
const inZone = computed(() => {
  if (!deliveryCheck.value) return null
  return deliveryCheck.value.withinZone === true
})
const error = ref('')
const aviso = ref('')
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
  // La cobertura debe estar comprobada y ser afirmativa. Antes solo se miraba
  // que hubiera una dirección elegida, así que una dirección guardada fuera de
  // zona dejaba el botón activo y el rechazo llegaba del servidor.
  if (inZone.value !== true) return false
  // El mínimo se comprueba aquí para no gastar un envío en un rechazo evitable,
  // pero el servidor lo vuelve a validar: es la regla que manda.
  if (belowMinOrder.value) return false
  if (!delivery.value) return false
  if (wantsInvoice.value && !billingValid.value) return false
  return true
})

/** Cuánto falta para alcanzar el pedido mínimo de la zona, en productos. */
const faltaParaMinimo = computed(() => {
  const min = Number(deliveryCheck.value?.minOrderAmount || 0)
  if (min <= 0) return 0
  return Math.max(0, Math.round((min - cart.subtotal) * 100) / 100)
})

const belowMinOrder = computed(() => faltaParaMinimo.value > 0.01)

const submitHint = computed(() => {
  if (cart.items.length === 0) return 'Tu carrito está vacío'
  if (!activeAddressValid.value) return 'Selecciona una dirección y comprueba si llegamos'
  if (deliveryChecking.value) return 'Comprobando si llegamos a esa dirección…'
  if (deliveryCheck.value && !deliveryCheck.value.withinZone) {
    const cerca = deliveryCheck.value.nearestZoneKm
    return cerca != null && cerca < 5
      ? `No cubrimos esa dirección: está a ${Math.round(cerca * 10) / 10} km de ${deliveryCheck.value.nearestZoneName}.`
      : 'No cubrimos esa dirección todavía. Estamos ampliar la zona de entrega.'
  }
  if (!deliveryCheck.value) return 'Comprueba si llegamos a esa dirección'
  if (belowMinOrder.value) {
    return `El pedido mínimo en tu zona es ${money(deliveryCheck.value.minOrderAmount)} en productos. ` +
      `Te faltan ${money(faltaParaMinimo)}. El envío no cuenta para el mínimo.`
  }
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
  return a.lat !== null && a.lng !== null && a.street && a.city
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

/**
 * Comprueba la cobertura de una dirección.
 *
 * Se hace por POST (y no GET con la query) para no meter coordenadas en los
 * logs de acceso ni en el historial del navegador. El estado de carga importa:
 * sin él, el botón se habilita antes de saber si hay cobertura.
 */
async function checkCoverage(lat, lng) {
  deliveryChecking.value = true
  try {
    deliveryCheck.value = await api.post('/api/delivery/check', { lat, lng })
  } catch (err) {
    deliveryCheck.value = null
    error.value =
      err.status === 429
        ? 'Demasiadas consultas seguidas. Espera un momento.'
        : 'No pudimos comprobar la cobertura de esa dirección.'
  } finally {
    deliveryChecking.value = false
  }
}

async function selectAddress(addr) {
  selectedAddressId.value = addr.id
  addressMode.value = 'existing'
  delivery.value = null
  await checkCoverage(addr.lat, addr.lng)
}

/** Resultado del aviso "¿llegamos a tu casa?", que no guarda nada. */
function onCoverageResult(data) {
  if (!data) return
  // Se previsualiza la cobertura en el resumen, pero no fija la dirección: el
  // cliente decide si guardarla.
  estimatedCoverage.value = data
}

const estimatedCoverage = ref(null)

function toggleNewAddress() {
  addressMode.value = addressMode.value === 'new' ? 'existing' : 'new'
  delivery.value = null
  if (addressMode.value === 'new') {
    deliveryCheck.value = null
    estimatedCoverage.value = null
  } else if (selectedAddressId.value) {
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
    // Se envían las líneas tal cual, incluso si un producto apareciera
    // repetido: el servidor las suma para validar el stock. Si el cliente tiene
    // el mismo producto en varias líneas, aquí se agregan para que el pedido
    // refleje exactamente lo que ve en el resumen.
    body.items = cart.grouped.map((i) => ({ productId: i.productId, quantity: i.quantity }))
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

/**
 * Reconcilia el carrito con el catálogo actual.
 *
 * El carrito guarda el precio con el que se añadió el producto. Si el negocio
 * cambia el precio o el descuento, el carrito seguía mostrando la cifra vieja
 * mientras el servidor cobra la nueva: el cliente veía un total y recibía otro.
 * Al abrir el checkout se vuelve a leer el catálogo y se avisa de las diferencias.
 */
async function reconcileCart() {
  if (!cart.items.length) return { cambios: [] }
  try {
    const data = await api.get('/api/catalog/products')
    const catalogo = new Map(data.products.map((p) => [p.id, p]))
    const cambios = []

    for (const item of cart.items) {
      const p = catalogo.get(item.productId)
      if (!p) {
        cambios.push({ type: 'removed', item })
        cart.remove(item.productId)
        continue
      }
      if (!p.active) {
        cambios.push({ type: 'inactive', item })
        cart.remove(item.productId)
        continue
      }
      const precioActual = discountedPrice(p.price, p.discount)
      const stock = Number(p.stock)
      let cantidad = Number(item.quantity)

      if (Number.isFinite(stock) && stock >= 0 && cantidad > stock) {
        cambios.push({ type: 'stock', item, stock })
        cantidad = stock
      }
      const minQ = Number(p.minQuantity) || 1
      if (cantidad < minQ) {
        cambios.push({ type: 'min', item, minQ })
        cantidad = minQ
      }
      if (Math.abs(cantidad - Number(item.quantity)) > 1e-9) {
        item.quantity = Math.round(cantidad * 100) / 100
      }
      if (Math.abs(precioActual - Number(item.price)) > 1e-9) {
        cambios.push({ type: 'price', item, antes: item.price, ahora: precioActual })
        item.price = precioActual
      }
      item.minQuantity = minQ
      item.stepQuantity = Number(p.stepQuantity) || 1
      item.name = p.name
      item.presentation = p.presentation || null
      item.imageUrl = p.imageUrl || null
      item.stock = p.stock
    }
    cart.persist()
    return cambios
  } catch {
    // Sin catálogo no se puede reconciliar: se deja el carrito como está y el
    // servidor volverá a validar cada cosa al confirmar el pedido.
    return []
  }
}

onMounted(async () => {
  await settings.load()
  await loadAddresses()
  const cambios = await reconcileCart()
  if (cambios.length) {
    const precios = cambios.filter((c) => c.type === 'price')
    const quitados = cambios.filter((c) => c.type === 'removed' || c.type === 'inactive')
    const ajustes = cambios.filter((c) => c.type === 'stock' || c.type === 'min')
    const partes = []
    if (precios.length) {
      partes.push(
        `el precio de ${precios.length} producto(s) cambió` +
          (precios.length === 1
            ? `: ${precios[0].item.name} pasa de ${money(precios[0].antes)} a ${money(precios[0].ahora)}`
            : ''),
      )
    }
    if (quitados.length) partes.push(`${quitados.length} producto(s) ya no están disponibles`)
    if (ajustes.length) partes.push(`se ajustaron las cantidades de ${ajustes.length} producto(s)`)
    // Aviso, no error: el pedido sigue siendo válido. Un cambio de precio o un
    // ajuste de cantidad es información que el cliente necesita ver antes de
    // confirmar, no un fallo.
    aviso.value = `Actualizamos tu carrito: ${partes.join('; ')}.`
  }
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

.summary-iva {
  font-weight: 400;
  font-size: 0.72rem;
  color: var(--gray);
}

.aviso-msg {
  background: #FFF8E1;
  border: 1px solid #FFE082;
  color: #7a5900;
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 0.82rem;
  margin-bottom: 12px;
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
