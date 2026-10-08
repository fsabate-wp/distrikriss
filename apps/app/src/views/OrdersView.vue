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
        <section v-if="repeat.available" class="repeat-box">
          <div class="repeat-head">
            <div>
              <h2 class="repeat-title">Pedir lo de siempre</h2>
              <p class="muted repeat-sub">
                Tu pedido {{ repeat.orderCode }} del {{ formatDate(repeat.orderDate) }}
                <span v-if="repeat.items.length === 1"> · 1 producto</span>
                <span v-else> · {{ repeat.items.length }} productos</span>
              </p>
            </div>
            <button class="btn btn-primary" :disabled="repeatLoading" @click="repetir">
              {{ repeatLoading ? 'Cargando…' : 'Repetir pedido' }}
            </button>
          </div>
          <div class="repeat-items">
            <span v-for="item in repeat.items" :key="item.productId" class="repeat-chip" :class="{ agotado: !item.available }">
              {{ item.name }} × {{ formatQty(item.quantity) }}
              <small v-if="!item.available" class="agotado-note">agotado</small>
            </span>
          </div>
          <p v-if="repeat.missing?.length" class="muted repeat-missing">
            {{ repeat.missing.map((m) => m.name).join(', ') }} ya no está disponible y no se incluye.
          </p>
        </section>

        <div v-if="repeatResult" class="alert" :class="repeatResult.omitidos.length ? 'alert-warn' : 'alert-ok'">
          <template v-if="repeatResult.agregados">
            Se agregaron {{ repeatResult.agregados }} producto{{ repeatResult.agregados === 1 ? '' : 's' }} a tu carrito.
            <router-link to="/carrito">Ir al carrito</router-link>
          </template>
          <template v-if="repeatResult.omitidos.length">
            <span class="muted">
              No se agregaron: {{ repeatResult.omitidos.map((o) => o.name).join(', ') }}.
            </span>
          </template>
        </div>

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
import { useCartStore } from '../stores/cart.js'
import { money, formatDate, STATUS_LABELS, PAYMENT_LABELS } from '../utils/format.js'

const orders = ref([])
const loading = ref(true)
const repeat = ref({ available: false, items: [], missing: [] })
const repeatLoading = ref(false)
const repeatResult = ref(null)
const cart = useCartStore()

function formatQty(v) {
  const n = Number(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

async function repetir() {
  repeatLoading.value = true
  repeatResult.value = null
  try {
    const data = await api.get('/api/orders/repeat/last')
    if (!data.available) return
    const r = cart.addMany(data.items)
    repeatResult.value = { agregados: r.agregados, omitidos: r.omitidos }
    if (r.priceChanged) {
      repeatResult.value.avisoPrecio = true
    }
  } catch (err) {
    repeatResult.value = { agregados: 0, omitidos: [{ name: 'No se pudo repetir el pedido' }] }
  } finally {
    repeatLoading.value = false
  }
}

onMounted(async () => {
  try {
    const [list, prev] = await Promise.all([
      api.get('/api/orders'),
      // Si el cliente no tiene pedidos, esto no puede romper la vista: la
      // recompra es una mejora, no un requisito para ver el historial.
      api.get('/api/orders/repeat/last').catch(() => ({ available: false })),
    ])
    orders.value = list.orders
    if (prev.available) repeat.value = prev
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

.repeat-box {
  background: white;
  border: 1px solid var(--green-light);
  border-radius: var(--radius-sm);
  padding: 20px;
  margin-bottom: 8px;
}

.repeat-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.repeat-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--green-dark);
}

.repeat-sub {
  font-size: 0.85rem;
}

.repeat-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.repeat-chip {
  background: var(--gray-light);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 0.8rem;
}

.repeat-chip.agotado {
  background: #FFF3E0;
  color: #a15c00;
  text-decoration: line-through;
}

.agotado-note {
  font-style: normal;
  font-size: 0.72rem;
}

.repeat-missing {
  margin-top: 10px;
  font-size: 0.8rem;
}

.alert {
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  font-size: 0.88rem;
  margin-bottom: 8px;
}

.alert-ok {
  background: #e8f5e9;
  border: 1px solid #a5d6a7;
}

.alert-warn {
  background: #FFF8E1;
  border: 1px solid #FFE082;
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
