<template>
  <section id="productos" class="section products">
    <div class="container">
      <h2 class="section-title">Nuestros Productos</h2>
      <p class="section-subtitle">Todo lo que necesitas para tu negocio o hogar</p>
      <div class="products-grid">
        <div
          v-for="product in products"
          :key="product.name"
          class="product-card"
        >
          <div class="product-img">
            <img :src="product.img" :alt="product.name" loading="lazy" />
          </div>
          <h3 class="product-name">{{ product.name }}</h3>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const products = [
  { name: 'Frutas', img: '/imgs/frutas.webp' },
  { name: 'Legumbres', img: '/imgs/legumbres.webp' },
  { name: 'Lácteos', img: '/imgs/lacteo.webp' },
  { name: 'Pollos', img: '/imgs/polllo.webp' },
  { name: 'Carnes', img: '/imgs/carnes.webp' },
  { name: 'Embutidos', img: '/imgs/embutidis.webp' },
  { name: 'Abastos', img: '/imgs/abasto.webp' },
  { name: 'Plásticos', img: '/imgs/plasticos.webp' }
]
</script>

<style scoped>
.products {
  background: var(--gray-light);
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.product-card {
  background: white;
  border-radius: var(--radius);
  padding: 36px 20px;
  text-align: center;
  transition: var(--transition);
  border: 1px solid rgba(0, 0, 0, 0.04);
  cursor: default;
}

.product-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-lg);
}

.product-img {
  width: 100%;
  height: 160px;
  margin-bottom: 16px;
  border-radius: 10px;
  overflow: hidden;
}

.product-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.product-card:hover .product-img img {
  transform: scale(1.08);
}

.product-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--green-dark);
}

@media (max-width: 1024px) {
  .products-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .products-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .product-card {
    padding: 28px 16px;
  }
}

@media (max-width: 480px) {
  .products-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}
</style>
