<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save" class="admin-card-stack">
      <div class="admin-card">
        <h2>Facturación electrónica</h2>
        <div class="switch-row">
          <label class="switch">
            <input type="checkbox" v-model="form.sriEnabled" />
            <span class="switch-slider"></span>
          </label>
          <div class="switch-text">
            <strong>{{ form.sriEnabled ? 'SRI activado' : 'SRI desactivado' }}</strong>
            <p class="muted">
              Al activarlo, en el checkout el cliente puede pedir factura con RUC. El comprobante se emite
              <strong>cuando el pago se confirma</strong>, no al crear el pedido.
            </p>
          </div>
        </div>
      </div>

      <template v-if="form.sriEnabled">
        <div v-if="warnings.length" class="admin-card warning-card">
          <h2>Falta configurar</h2>
          <ul class="warning-list">
            <li v-for="w in warnings" :key="w">{{ w }}</li>
          </ul>
          <p class="muted">Hasta completar estos datos, no se podrá emitir ni firmar la factura electrónica.</p>
        </div>

        <div v-if="health && health.advertencias && health.advertencias.length" class="admin-card warning-card">
          <h2>Revisar</h2>
          <ul class="warning-list">
            <li v-for="w in health.advertencias" :key="w">{{ w }}</li>
          </ul>
        </div>

        <div v-if="health" class="admin-card">
          <h2>Estado</h2>
          <div class="health-grid">
            <div class="health-item" :class="health.certificate.ok ? 'ok' : 'bad'">
              <strong>Certificado</strong>
              <span v-if="health.certificate.ok">
                {{ health.certificate.rucMatches ? 'Correcto' : '⚠ RUC no coincide' }}
                <span class="muted">· vence en {{ health.certificate.daysLeft }} días</span>
              </span>
              <span v-else>{{ health.certificate.error }}</span>
            </div>
            <div class="health-item" :class="health.configured ? 'ok' : 'bad'">
              <strong>Emisión</strong>
              <span>{{ health.configured ? 'Lista' : 'Incompleta' }}</span>
            </div>
            <div class="health-item" :class="health.environment === 'PRODUCCION' ? 'ok' : 'warn'">
              <strong>Ambiente</strong>
              <span>{{ health.environment }}</span>
            </div>
            <div class="health-item" :class="unresolvedCount ? 'warn' : 'ok'">
              <strong>Pendientes</strong>
              <span>{{ unresolvedCount }} sin resolver</span>
            </div>
          </div>
          <p v-if="!health.encryptionAvailable" class="error-msg">
            El servidor no tiene <code>SRI_CERT_SECRET</code>, así que no puede cifrar la contraseña del
            certificado. La tienda funciona con normalidad; define la variable y reinicia la API para poder
            activar la facturación.
          </p>
          <p v-if="health.certificate.ok && health.certificate.expiringSoon" class="error-msg">
            El certificado vence el {{ formatDate(health.certificate.notAfter) }}. Sin un certificado vigente el SRI
            no autoriza ningún comprobante.
          </p>
          <p v-if="health.certificate.ok && !health.certificate.rucMatches" class="error-msg">
            El RUC del certificado ({{ health.certificate.rucInCertificate }}) no coincide con el configurado
            ({{ form.ruc }}). El SRI rechazará todos los comprobantes.
          </p>
        </div>

        <div class="admin-card">
          <h2>Datos del contribuyente</h2>
          <div class="form-grid">
            <div class="form-group">
              <label>RUC</label>
              <input v-model="form.ruc" class="form-control" maxlength="13" inputmode="numeric" placeholder="13 dígitos" />
              <p v-if="form.ruc && !rucOk" class="error-msg">El RUC no es válido</p>
            </div>
            <div class="form-group"><label>Razón social</label><input v-model="form.businessName" class="form-control" maxlength="160" /></div>
            <div class="form-group"><label>Nombre comercial</label><input v-model="form.tradeName" class="form-control" maxlength="160" /></div>
            <div class="form-group"><label>Dirección del establecimiento</label><input v-model="form.sriAddress" class="form-control" maxlength="200" /></div>
            <div class="form-group">
              <label>Ambiente SRI</label>
              <select v-model.number="form.sriEnvironment" class="form-control">
                <option :value="1">Producción</option>
                <option :value="2">Pruebas</option>
              </select>
              <p class="muted color-help">Usa Pruebas mientras no tengas el certificado de producción.</p>
            </div>
            <div class="form-group">
              <label>IVA general (%)</label>
              <select v-model.number="form.sriIvaRate" class="form-control">
                <option v-for="t in ivaRates" :key="t" :value="t">{{ t }}%</option>
              </select>
              <p class="muted color-help">Solo tarifas existentes en el catálogo del SRI.</p>
            </div>
            <div class="form-group">
              <label>El envío lleva IVA</label>
              <select v-model="form.sriDeliveryTaxable" class="form-control">
                <option :value="true">Sí, se factura con IVA</option>
                <option :value="false">No, el envío va exonerado</option>
              </select>
            </div>
            <div class="form-group">
              <label>Obligado a llevar contabilidad</label>
              <select v-model="form.sriObligadoContabilidad" class="form-control">
                <option :value="true">Sí</option>
                <option :value="false">No</option>
              </select>
            </div>
          </div>
        </div>

        <div class="admin-card">
          <h2>Secuencial</h2>
          <div class="form-grid">
            <div class="form-group"><label>Establecimiento (3 dígitos)</label><input v-model="form.sriEstablishment" class="form-control" maxlength="3" inputmode="numeric" /></div>
            <div class="form-group"><label>Punto de emisión (3 dígitos)</label><input v-model="form.sriEmissionPoint" class="form-control" maxlength="3" inputmode="numeric" /></div>
            <div class="form-group"><label>Contribuyente especial (Nro.)</label><input v-model="form.sriSpecialContributor" class="form-control" maxlength="40" /></div>
          </div>
          <p class="muted">
            Los comprobantes se numeran de forma correlativa y sin huecos. No cambies el punto de emisión después de
            haber emitido: el SRI no acepta series paralelas con la misma resolución.
          </p>
        </div>

        <div class="admin-card">
          <h2>Certificado de firma electrónica</h2>
          <p class="muted">
            Archivo .p12 emitido por el SRI. Se guarda cifrado en el servidor y la contraseña nunca vuelve a salir de
            aquí una vez guardada.
          </p>
          <div v-if="form.sriCertificateFile" class="switch-row" style="margin-bottom: 12px">
            <div class="switch-text">
              <strong>Certificado cargado</strong>
              <p class="muted mono">{{ form.sriCertificateFile }}</p>
            </div>
          </div>
          <div class="form-group">
            <label class="btn btn-outline file-btn">
              {{ form.sriCertificateFile ? 'Reemplazar certificado' : 'Subir certificado (.p12)' }}
              <input type="file" accept=".p12,.pfx" hidden @change="uploadCert" />
            </label>
            <button
              v-if="form.sriCertificateFile"
              type="button"
              class="btn btn-danger btn-sm"
              style="margin-left: 8px"
              @click="clearCert"
            >
              Quitar
            </button>
            <p v-if="certUploading" class="muted">Subiendo…</p>
          </div>
          <div class="form-group">
            <label>Contraseña del certificado</label>
            <input
              v-model="form.sriCertificatePassword"
              type="password"
              class="form-control"
              autocomplete="new-password"
              :placeholder="passwordSet ? 'Guardada — escribe para cambiarla' : 'Contraseña del .p12'"
            />
            <p class="muted">
              <template v-if="passwordSet && !form.sriCertificatePassword">
                Ya hay una contraseña guardada y cifrada. Déjala vacía para conservarla.
              </template>
              <template v-else>
                Se cifra con AES-256-GCM antes de guardarse. Si la olvidas, vuelve a subir el .p12.
              </template>
            </p>
            <p v-if="form.sriCertificatePassword" class="muted">
              Se guardará una contraseña nueva (dejando la anterior sin efecto).
            </p>
          </div>
          <div class="form-group">
            <button type="button" class="btn btn-outline" :disabled="testing || warnings.length > 0" @click="testConnection">
              {{ testing ? 'Probando…' : 'Probar conexión con el SRI' }}
            </button>
            <p class="muted">
              Verifica que el certificado se lee, que su RUC coincide con el tuyo y que el servidor alcanza los
              servicios del SRI. No emite ningún comprobante.
            </p>
          </div>
          <div v-if="testResult" class="sri-test-result">
            <p><strong>Ambiente:</strong> {{ testResult.environmentLabel }}</p>
            <p v-if="!testResult.certificate.ok" class="error-msg">Certificado: {{ testResult.certificate.error }}</p>
            <template v-else>
              <p class="ok-note">Certificado válido hasta el {{ formatDate(testResult.certificate.notAfter) }}</p>
              <p v-if="testResult.certificate.rucMatches" class="ok-note">RUC del certificado: coincide</p>
              <p v-else class="error-msg">
                RUC del certificado ({{ testResult.certificate.rucInCertificate }}) no coincide con el configurado
              </p>
            </template>
            <div v-for="c in testResult.checks" :key="c.name" class="test-line">
              <span :class="c.reachable && c.httpStatus === 200 ? 'test-ok' : 'test-fail'">
                {{ c.reachable && c.httpStatus === 200 ? '✓' : '✗' }}
              </span>
              <strong>{{ c.name }}</strong>
              <span class="muted">{{ c.reachable ? `${c.httpStatus} · ${c.ms} ms` : c.error }}</span>
            </div>
            <p v-if="testResult.ok" class="ok-note">Conexión SRI correcta.</p>
            <p v-else class="error-msg">La conexión presenta problemas. Revisa la configuración y el acceso a internet.</p>
          </div>
        </div>
      </template>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="saved" class="saved-note">✓ Cambios guardados</p>

      <div class="actions">
        <button type="submit" class="btn btn-primary" :disabled="saving || (form.sriEnabled && !rucOk)">
          {{ saving ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../api/client.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// Catálogo del SRI. El servidor rechaza cualquier tarifa que no esté aquí.
const ivaRates = [0, 2, 3, 4, 5, 10, 12, 14, 15]

const form = ref(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const certUploading = ref(false)
const testing = ref(false)
const testResult = ref(null)
const health = ref(null)
const passwordSet = ref(false)

const rucOk = computed(() => !form.value || !form.value.ruc || validateRuc(form.value.ruc))

const unresolvedCount = computed(() => {
  const byStatus = health.value?.byStatus || []
  return byStatus
    .filter((s) => ['FAILED', 'REJECTED', 'NOT_AUTHORIZED'].includes(s.status))
    .reduce((a, s) => a + s.count, 0)
})

const warnings = computed(() => {
  if (!form.value) return []
  const out = []
  if (form.value.sriEnabled && !rucOk.value) out.push('El RUC ingresado no es válido.')
  if (form.value.sriEnabled && !form.value.businessName.trim()) out.push('Falta la razón social.')
  if (form.value.sriEnabled && !form.value.sriCertificateFile) out.push('Falta subir el certificado digital (.p12).')
  if (form.value.sriEnabled && !passwordSet.value && !form.value.sriCertificatePassword) {
    out.push('Falta la contraseña del certificado.')
  }
  if (form.value.sriEnabled && form.value.sriCertificateFile && !passwordSet.value && form.value.sriCertificatePassword) {
    // Se está configurando por primera vez: está bien, no avisa.
  }
  if (form.value.sriEnabled && form.value.sriEnvironment === 2) {
    out.push('Estás en el ambiente de Pruebas: los comprobantes no tienen validez tributaria.')
  }
  return out
})

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' })
}

function validateRuc(ruc) {
  const r = String(ruc || '').replace(/\D/g, '')
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

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    const s = data.settings
    passwordSet.value = Boolean(s.sriCertificatePasswordSet)
    form.value = {
      sriEnabled: s.sriEnabled === true,
      ruc: s.ruc || '',
      businessName: s.businessName || '',
      tradeName: s.tradeName || '',
      sriAddress: s.sriAddress || '',
      sriEnvironment: s.sriEnvironment === 1 ? 1 : 2,
      sriIvaRate: ivaRates.includes(Number(s.sriIvaRate)) ? Number(s.sriIvaRate) : 15,
      sriDeliveryTaxable: s.sriDeliveryTaxable !== false,
      sriObligadoContabilidad: s.sriObligadoContabilidad !== false,
      sriEstablishment: s.sriEstablishment || '003',
      sriEmissionPoint: s.sriEmissionPoint || '001',
      sriSpecialContributor: s.sriSpecialContributor || '',
      sriCertificateFile: s.sriCertificateFile || '',
      // El servidor nunca devuelve la contraseña: el campo arranca vacío y solo
      // se envía si el administrador escribe algo.
      sriCertificatePassword: '',
    }
    await loadHealth()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadHealth() {
  try {
    health.value = await api.get('/api/admin/sri/health')
  } catch {
    health.value = null
  }
}

async function testConnection() {
  error.value = ''
  testResult.value = null
  testing.value = true
  try {
    testResult.value = await api.post('/api/admin/sri/test')
  } catch (err) {
    testResult.value = { ok: false, environmentLabel: '—', certificate: { ok: false, error: err.message }, checks: [] }
  } finally {
    testing.value = false
  }
}

function clearCert() {
  form.value.sriCertificateFile = ''
  // Al quitar el certificado hay que volver a introducir la contraseña: la que
  // había cifrada correspondía a ese archivo.
  form.value.sriCertificatePassword = ''
  passwordSet.value = false
}

async function uploadCert(e) {
  const file = e.target.files[0]
  if (!file) return
  if (!/\.(p12|pfx)$/i.test(file.name)) {
    error.value = 'Selecciona el archivo .p12 emitido por el SRI'
    e.target.value = ''
    return
  }
  certUploading.value = true
  error.value = ''
  try {
    const fd = new FormData()
    fd.append('certificate', file)
    const res = await fetch(`${API_URL}/api/admin/uploads/certificate`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo subir el certificado')
    form.value.sriCertificateFile = data.filename
    form.value.sriCertificatePassword = ''
    passwordSet.value = false
  } catch (err) {
    error.value = err.message
  } finally {
    certUploading.value = false
    e.target.value = ''
  }
}

async function save() {
  error.value = ''
  saved.value = false
  saving.value = true
  try {
    const payload = { ...form.value }
    // Si la contraseña ya estaba guardada y el campo quedó vacío, no se manda
    // para que el servidor conserve la que tiene.
    if (!payload.sriCertificatePassword) delete payload.sriCertificatePassword
    await api.put('/api/admin/settings', payload)
    passwordSet.value = true
    form.value.sriCertificatePassword = ''
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
    await loadHealth()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.warning-card {
  border: 1px solid #ffe082;
  background: #fff8e1;
}

.warning-list {
  margin: 8px 0 4px;
  padding-left: 20px;
  color: #e65100;
  font-size: 0.9rem;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.health-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--gray-light);
  font-size: 0.85rem;
}

.health-item.ok {
  border-left: 3px solid #2e7d32;
}

.health-item.warn {
  border-left: 3px solid #ef6c00;
}

.health-item.bad {
  border-left: 3px solid #c62828;
}

.health-item span {
  font-size: 0.8rem;
}

.color-help {
  font-size: 0.78rem;
}

.mono {
  font-family: monospace;
  font-size: 0.75rem;
  word-break: break-all;
}

.sri-test-result {
  margin-top: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--gray-light);
  font-size: 0.88rem;
}

.test-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.test-ok {
  color: #1b5e20;
  font-weight: 900;
}

.test-fail {
  color: #c62828;
  font-weight: 900;
}

.ok-note {
  color: #1b5e20;
  font-weight: 700;
  margin-top: 6px;
}
</style>
