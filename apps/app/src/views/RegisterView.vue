<template>
  <div class="page auth-page">
    <div class="container auth-container">
      <div class="auth-card">
        <h1 class="section-title">Crea tu cuenta</h1>
        <p class="muted auth-sub">Pide online y recibe en tu puerta</p>

        <form @submit.prevent="submit">
          <div class="form-group">
            <label for="name">Nombre completo</label>
            <input id="name" v-model="form.name" class="form-control" placeholder="Tu nombre" required />
          </div>
          <div class="form-group">
            <label for="phone">Teléfono</label>
            <input id="phone" v-model="form.phone" class="form-control" placeholder="0990000000" inputmode="tel" required />
          </div>
          <div class="form-group">
            <label for="email">Email <span class="muted">(opcional)</span></label>
            <input id="email" v-model="form.email" type="email" class="form-control" placeholder="tucorreo@ejemplo.com" />
          </div>
          <div class="form-group">
            <label for="password">Contraseña</label>
            <input id="password" v-model="form.password" type="password" class="form-control" placeholder="Mínimo 6 caracteres" required />
          </div>
          <div class="form-group">
            <label for="confirm">Confirmar contraseña</label>
            <input id="confirm" v-model="form.confirm" type="password" class="form-control" required />
          </div>
          <p v-if="error" class="error-msg">{{ error }}</p>
          <button type="submit" class="btn btn-primary btn-block" :disabled="auth.loading">
            {{ auth.loading ? 'Creando cuenta…' : 'Crear cuenta' }}
          </button>
        </form>

        <p class="auth-switch">
          ¿Ya tienes cuenta?
          <router-link to="/login">Ingresa aquí</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const form = reactive({ name: '', phone: '', email: '', password: '', confirm: '' })
const error = ref('')

async function submit() {
  error.value = ''
  if (form.password !== form.confirm) {
    error.value = 'Las contraseñas no coinciden'
    return
  }
  try {
    await auth.register({
      name: form.name,
      phone: form.phone,
      email: form.email,
      password: form.password,
    })
    router.push({ name: 'home' })
  } catch (err) {
    error.value = err.message
  }
}
</script>

<style scoped>
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
