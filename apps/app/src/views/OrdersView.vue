<template>
  <div class="page">
    <div class="container">
      <h1 class="section-title">Mis pedidos</h1>

      <div v-if="loading" class="spinner"></div>

      <div v-else-if="orders.length === 0" class="empty-state">
        <h3>No tienes pedidos todavía</h3>
        <router-link to="/" class="btn btn-primary">Ir a la tienda</router-link>
      </div>

      <div v-else class="orders-list">
        <router-link v-for="order in orders" :key="order.id" :to="`/pedidos/${order.id}`" class="order-row">
          <div class="order-main">
            <p class="order-code">{{ order.code }}</p>
            <p class="muted">{{ formatDate(order.deliveryDate) }} · {{ order.slotLabel }}</p>
          </div>
          <div class="order-mid">
            <span class="badge" :class="`badge-${order.status.toLowerCase()}`">{{ STATUS_LABELS[order.status] }}</span>
            <span class="order-pay">{{ PAYMENT_LABELS[order.paymentMethod] }}</span>
          </div>
          <div class="order-total">{{ money(order.total) }}</div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/client.js'
import { money, formatDate, STATUS_LABELS, PAYMENT_LABELS } from '../utils/format.js'

const orders = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const data = await api.get('/api/orders')
    orders.value = data.orders
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.orders-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-row {
  display: flex;
  align-items: center;
  gap: 20px;
  background: white;
  border: 1px solid var(--gray-mid);
  border-radius: var(--radius-sm);
  padding: 18px 20px;
  transition: var(--transition);
}

.order-row:hover {
  border-color: var(--green-light);
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.order-main {
  flex: 1;
}

.order-code {
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--green-dark);
}

.order-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.order-pay {
  font-size: 0.78rem;
  color: var(--gray);
}

.order-total {
  font-weight: 800;
  font-size: 1.15rem;
  color: var(--green-dark);
  min-width: 90px;
  text-align: right;
}

@media (max-width: 600px) {
  .order-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .order-total {
    text-align: left;
  }
}
</style>
