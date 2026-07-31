<template>
  <div class="page home-page">
    <section class="hero">
      <div class="container">
        <h1>Pide online,<br />te lo llevamos</h1>
        <p v-if="settings.settings" class="hero-sub">
          {{ settings.settings.storeName }} · Entrega programada · Pedido mínimo {{ money(settings.settings.minOrderAmount) }}
        </p>
      </div>
    </section>

    <div class="container">
      <div class="toolbar">
        <div class="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input v-model="catalog.search" type="search" placeholder="Buscar producto…" @input="onSearch" />
        </div>
        <select v-model="catalog.sort" class="form-control sort-select" @change="catalog.loadProducts()">
          <option value="recent">Más recientes</option>
          <option value="name">Nombre A-Z</option>
          <option value="price_asc">Precio: menor a mayor</option>
          <option value="price_desc">Precio: mayor a menor</option>
        </select>
      </div>

      <div class="category-chips">
        <button class="chip" :class="{ active: catalog.category === null }" @click="setCategory(null)">Todos</button>
        <button
          v-for="cat in catalog.categories"
          :key="cat.id"
          class="chip"
          :class="{ active: catalog.category === cat.slug }"
          @click="setCategory(cat.slug)"
        >
          {{ cat.name }}
        </button>
      </div>

      <div v-if="catalog.loading" class="spinner"></div>

      <div v-else-if="catalog.products.length === 0" class="empty-state">
        <h3>Sin resultados</h3>
        <p>Prueba con otro término o categoría</p>
      </div>

      <div v-else class="products-grid">
        <ProductCard v-for="p in catalog.products" :key="p.id" :product="p" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useCatalogStore } from '../stores/catalog.js'
import { useSettingsStore } from '../stores/settings.js'
import { money } from '../utils/format.js'
import ProductCard from '../components/ProductCard.vue'

const catalog = useCatalogStore()
const settings = useSettingsStore()

let searchTimer = null
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => catalog.loadProducts(), 350)
}

function setCategory(slug) {
  catalog.category = slug
  catalog.loadProducts()
}

onMounted(() => {
  catalog.refresh()
  settings.load()
})
</script>

<style scoped>
.home-page {
  padding-top: 0;
}

.hero {
  background: linear-gradient(135deg, var(--green-dark), var(--green-mid));
  color: white;
  padding: 70px 0 90px;
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3.2rem);
  font-weight: 900;
  line-height: 1.15;
}

.hero-sub {
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

.toolbar {
  display: flex;
  gap: 14px;
  margin-top: -40px;
  background: white;
  padding: 16px;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  position: relative;
  z-index: 10;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--gray-light);
  border-radius: var(--radius-sm);
  padding: 0 16px;
  color: var(--gray);
}

.search-box input {
  flex: 1;
  border: none;
  background: none;
  padding: 13px 0;
  font-size: 0.95rem;
  outline: none;
}

.sort-select {
  width: auto;
  min-width: 190px;
}

.category-chips {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 24px 0;
}

.chip {
  padding: 8px 18px;
  border-radius: 50px;
  border: 1.5px solid var(--gray-mid);
  background: white;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--green-dark);
  transition: var(--transition);
}

.chip:hover {
  border-color: var(--green-light);
}

.chip.active {
  background: var(--green-dark);
  border-color: var(--green-dark);
  color: white;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  padding-bottom: 40px;
}

@media (max-width: 1024px) {
  .products-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
  }

  .sort-select {
    width: 100%;
  }

  .products-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
}
</style>
