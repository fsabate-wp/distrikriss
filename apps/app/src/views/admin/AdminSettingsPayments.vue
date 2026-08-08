<template>
  <div class="settings-page">
    <div v-if="loading" class="spinner"></div>

    <form v-else @submit.prevent="save" class="admin-card-stack">
      <div class="admin-card">
        <h2>Transferencia bancaria</h2>
        <div class="switch-row">
          <label class="switch">
            <input type="checkbox" v-model="form.enabled" />
            <span class="switch-slider"></span>
          </label>
          <div class="switch-text">
            <strong>{{ form.enabled ? 'Activado' : 'Desactivado' }}</strong>
            <p class="muted">Mostrar datos bancarios al cliente al finalizar el pedido.</p>
          </div>
        </div>

        <template v-if="form.enabled">
          <div class="form-grid" style="margin-top: 16px">
            <div class="form-group"><label>Banco</label><input v-model="form.bank" class="form-control" /></div>
            <div class="form-group"><label>Número de cuenta</label><input v-model="form.account" class="form-control" /></div>
            <div class="form-group"><label>Titular</label><input v-model="form.accountHolder" class="form-control" /></div>
            <div class="form-group"><label>Cédula o RUC</label><input v-model="form.holderId" class="form-control" /></div>
          </div>
        </template>
      </div>

      <div class="admin-card">
        <h2>Efectivo contra entrega</h2>
        <div class="switch-row">
          <label class="switch">
            <input type="checkbox" v-model="form.cashOnDelivery" />
            <span class="switch-slider"></span>
          </label>
          <div class="switch-text">
            <strong>{{ form.cashOnDelivery ? 'Activado' : 'Desactivado' }}</strong>
            <p class="muted">Permitir que el cliente pague en efectivo al recibir su pedido.</p>
          </div>
        </div>
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="saved" class="saved-note">✓ Cambios guardados</p>

      <div class="actions">
        <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar cambios' }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api/client.js'

const form = ref(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)

async function load() {
  try {
    const data = await api.get('/api/admin/settings')
    const p = data.settings.payments || {}
    const t = p.transfer || {}
    form.value = {
      enabled: !!t.enabled,
      bank: t.bank || '',
      account: t.account || '',
      accountHolder: t.accountHolder || '',
      holderId: t.holderId || '',
      cashOnDelivery: p.cashOnDelivery !== false,
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function save() {
  error.value = ''
  saved.value = false
  saving.value = true
  try {
    await api.put('/api/admin/settings', {
      payments: {
        transfer: {
          enabled: form.value.enabled,
          bank: form.value.bank,
          account: form.value.account,
          accountHolder: form.value.accountHolder,
          holderId: form.value.holderId,
        },
        cashOnDelivery: form.value.cashOnDelivery,
      },
    })
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
