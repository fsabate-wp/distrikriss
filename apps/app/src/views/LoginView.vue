<template>
  <div class="page auth-page">
    <div class="container auth-container">
      <div class="auth-card">
        <h1 class="section-title">Ingresar</h1>
        <p class="muted auth-sub">Bienvenido de vuelta a DistriKriss</p>
        <div v-if="expiredMsg" class="expired-banner">{{ expiredMsg }}</div>

        <form @submit.prevent="submit">
          <div class="form-group">
            <label for="identifier">Teléfono o email</label>
            <input id="identifier" v-model="form.identifier" class="form-control" placeholder="0990000000" required />
          </div>
          <div class="form-group">
            <label for="password">Contraseña</label>
            <input id="password" v-model="form.password" type="password" class="form-control" placeholder="••••••••" required />
          </div>
          <p v-if="error" class="error-msg">{{ error }}</p>
          <button type="submit" class="btn btn-primary btn-block" :disabled="auth.loading">
            {{ auth.loading ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>

        <p class="auth-switch">
          ¿No tienes cuenta?
          <router-link to="/registro">Regístrate</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = reactive({ identifier: '', password: '' })
const error = ref('')
const expiredMsg = ref('')

onMounted(() => {
  if (route.query.expired === '1') {
    expiredMsg.value = 'Tu sesión expiró, por favor inicia sesión de nuevo.'
  } else {
    try {
      if (sessionStorage.getItem('sessionExpired') === '1') {
        expiredMsg.value = 'Tu sesión expiró, por favor inicia sesión de nuevo.'
        sessionStorage.removeItem('sessionExpired')
      }
    } catch {}
  }
})

async function submit() {
  error.value = ''
  try {
    await auth.login(form)
    try { sessionStorage.removeItem('sessionExpired'); sessionStorage.removeItem('redirectAfterLogin') } catch {}
    // Si es admin, redirigir al dashboard automáticamente
    if (auth.isAdmin) {
      const redirect = route.query.redirect
      // si el redirect ya es una ruta admin, respetarlo; sino ir al dashboard
      if (typeof redirect === 'string' && redirect.startsWith('/admin')) {
        router.push(redirect)
      } else {
        router.push({ name: 'admin' })
      }
      return
    }
    router.push(route.query.redirect || { name: 'home' })
  } catch (err) {
    error.value = err.message
  }
}
</script>

<style scoped>
.auth-page .section-title {
  color: var(--dark);
}

.auth-page {
  display: flex;
  align-items: flex-start;
}

.auth-container {
  max-width: 460px;
}

.auth-card {
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius);
  padding: 40px 36px;
  box-shadow: var(--shadow);
}

.auth-sub {
  margin-bottom: 28px;
}

.expired-banner {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffe69c;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 18px;
  text-align: center;
}

.auth-switch {
  margin-top: 20px;
  text-align: center;
  font-size: 0.92rem;
  color: var(--gray);
}

.auth-switch a {
  color: var(--green-dark);
  font-weight: 700;
}
</style>
