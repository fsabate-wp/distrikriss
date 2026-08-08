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
            <p class="muted">Al activarlo, en el checkout se preguntará si el cliente quiere factura con RUC y se generará la factura electrónica al confirmar el pedido.</p>
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

        <div class="admin-card">
          <h2>Datos del contribuyente</h2>
          <div class="form-grid">
            <div class="form-group">
              <label>RUC</label>
              <input v-model="form.ruc" class="form-control" maxlength="13" placeholder="13 dígitos" />
              <p v-if="form.ruc && !rucOk" class="error-msg">El RUC no es válido</p>
            </div>
            <div class="form-group"><label>Razón social</label><input v-model="form.businessName" class="form-control" /></div>
            <div class="form-group"><label>Nombre comercial</label><input v-model="form.tradeName" class="form-control" /></div>
            <div class="form-group"><label>Dirección del establecimiento</label><input v-model="form.sriAddress" class="form-control" /></div>
            <div class="form-group">
              <label>Ambiente SRI</label>
              <select v-model.number="form.sriEnvironment" class="form-control">
                <option :value="1">Producción</option>
                <option :value="2">Pruebas</option>
              </select>
              <p class="muted color-help">Usa Pruebas mientras no tengas el certificado de producción.</p>
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
          <h2>Secuencial y extras</h2>
          <div class="form-grid">
            <div class="form-group"><label>Establecimiento (3 dígitos)</label><input v-model="form.sriEstablishment" class="form-control" maxlength="3" /></div>
            <div class="form-group"><label>Punto de emisión (3 dígitos)</label><input v-model="form.sriEmissionPoint" class="form-control" maxlength="3" /></div>
            <div class="form-group"><label>Resolución de agente de retención</label><input v-model="form.sriAccountingResolution" class="form-control" placeholder="Nro. Resolución (opcional)" /></div>
            <div class="form-group"><label>Contribuyente especial (Nro.)</label><input v-model="form.sriSpecialContributor" class="form-control" placeholder="Opcional" /></div>
            <div class="form-group"><label>IVA (%)</label><input v-model.number="form.sriIvaRate" type="number" step="0.01" min="0" max="100" class="form-control" /></div>
          </div>
        </div>

        <div class="admin-card">
          <h2>Certificado de firma electrónica</h2>
          <p class="muted">Archivo .p12 emitido por el SRI (o el proveedor autorizado). Es la firma con la que se firman los XML.</p>
          <div v-if="form.sriCertificateFile" class="switch-row" style="margin-bottom: 12px">
            <div class="switch-text">
              <strong>Certificado cargado</strong>
              <p class="muted">{{ form.sriCertificateFile }}</p>
            </div>
          </div>
          <div class="form-group">
            <label class="btn btn-outline file-btn">
              {{ form.sriCertificateFile ? 'Reemplazar certificado' : 'Subir certificado (.p12)' }}
              <input type="file" accept=".p12,application/x-pkcs12" hidden @change="uploadCert" />
            </label>
            <button v-if="form.sriCertificateFile" type="button" class="btn btn-danger btn-sm" style="margin-left: 8px" @click="form.sriCertificateFile = ''">Quitar</button>
            <p v-if="certUploading" class="muted">Subiendo…</p>
          </div>
          <div class="form-group">
            <label>Contraseña del certificado</label>
            <input v-model="form.sriCertificatePassword" type="password" class="form-control" autocomplete="off" />
          </div>
          <div class="form-group">
            <button type="button" class="btn btn-outline" :disabled="testing || warnings.length > 0" @click="testConnection">
              {{ testing ? 'Probando…' : 'Probar conexión con el SRI' }}
            </button>
            <p class="muted">Verifica que el certificado se lee con la contraseña y que el servidor alcanza los web services del SRI. No emite ningún comprobante.</p>
          </div>
          <div v-if="testResult" class="sri-test-result">
            <p v-if="testResult.providerError" class="error-msg">{{ testResult.providerError }}</p>
            <template v-else>
              <p><strong>Ambiente:</strong> {{ testResult.environmentLabel }}</p>
              <p v-if="!testResult.certificate.ok" class="error-msg">Certificado: {{ testResult.certificate.error }}</p>
              <p class="ok-note" v-else>Certificado: se lee correctamente con la contraseña</p>
              <div v-for="c in testResult.checks" :key="c.name" class="test-line">
                <span :class="c.reachable && c.httpStatus === 200 ? 'test-ok' : 'test-fail'">{{ c.reachable && c.httpStatus === 200 ? '✓' : '✗' }}</span>
                <strong>{{ c.name }}</strong>
                <span class="muted">{{ c.reachable ? `${c.httpStatus} · ${c.ms} ms` : c.error }}</span>
              </div>
              <p v-if="testResult.ok" class="ok-note">Conexión SRI correcta.</p>
              <p v-else class="error-msg">La conexión presenta problemas. Revisa la configuración y que el servidor tenga acceso a internet.</p>
            </template>
          </div>
        </div>
      </template>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="saved" class="saved-note">✓ Cambios guardados</p>

      <div class="actions">
        <button type="submit" class="btn btn-primary" :disabled="saving || (form.sriEnabled && !rucOk)">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../api/client.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const form = ref(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const certUploading = ref(false)
const testing = ref(false)
const testResult = ref(null)

const rucOk = computed(() => !form.value || !form.value.ruc || validateRuc(form.value.ruc))

const warnings = computed(() => {
  if (!form.value) return []
  const out = []
  if (form.value.sriEnabled && !rucOk.value) out.push('El RUC ingresado no es válido.')
  if (form.value.sriEnabled && !form.value.businessName.trim()) out.push('Falta la razón social.')
  if (form.value.sriEnabled && !form.value.sriCertificateFile) out.push('Falta subir el certificado digital (.p12).')
  if (form.value.sriEnabled && !form.value.sriCertificatePassword) out.push('Falta la contraseña del certificado.')
  if (form.value.sriEnabled && form.value.sriEnvironment === 2) out.push('Estás en el ambiente de Pruebas: los comprobantes se generan, pero no cuentan como facturas reales.')
  return out
})

async function testConnection() {
  error.value = ''
  testResult.value = null
  testing.value = true
  try {
    testResult.value = await api.post('/api/admin/sri/test')
  } catch (err) {
    testResult.value = { ok: false, providerError: err.message }
  } finally {
    testing.value = false
  }
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
    form.value = {
      sriEnabled: s.sriEnabled === true,
      ruc: s.ruc || '',
      businessName: s.businessName || '',
      tradeName: s.tradeName || '',
      sriAddress: s.sriAddress || '',
      sriEnvironment: s.sriEnvironment === 1 ? 1 : 2,
      sriObligadoContabilidad: s.sriObligadoContabilidad !== false,
      sriEstablishment: s.sriEstablishment || '003',
      sriEmissionPoint: s.sriEmissionPoint || '001',
      sriAccountingResolution: s.sriAccountingResolution || '',
      sriSpecialContributor: s.sriSpecialContributor || '',
      sriIvaRate: Number(s.sriIvaRate) || 15,
      sriCertificateFile: s.sriCertificateFile || '',
      sriCertificatePassword: s.sriCertificatePassword || '',
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function uploadCert(e) {
  const file = e.target.files[0]
  if (!file) return
  certUploading.value = true
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
  } catch (err) {
    alert(err.message)
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
    await api.put('/api/admin/settings', { ...form.value })
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
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
  border: 1px solid #FFE082;
  background: #FFF8E1;
}

.warning-list {
  margin: 8px 0 4px;
  padding-left: 20px;
  color: #E65100;
  font-size: 0.9rem;
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
  color: #1B5E20;
  font-weight: 900;
}

.test-fail {
  color: #C62828;
  font-weight: 900;
}

.ok-note {
  color: #1B5E20;
  font-weight: 700;
  margin-top: 6px;
}
</style>
