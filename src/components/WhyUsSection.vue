<template>
  <section id="nosotros" class="section why-us">
    <div class="container">
      <h2 class="section-title">¿Por qué elegirnos?</h2>
      <p class="section-subtitle">Más de una razón para confiar en DistriKriss</p>
      <div class="features-grid">
        <div class="feature-card" v-for="feature in features" :key="feature.title">
          <div class="feature-icon" v-html="feature.icon"></div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const features = [
  {
    title: 'Al por Mayor',
    desc: 'Precios competitivos para negocios y comercios. Grandes volúmenes con las mejores condiciones.',
    icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
  },
  {
    title: 'Al por Menor',
    desc: 'Atención personalizada para tu hogar. Compra lo que necesitas sin compromiso de volumen.',
    icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>'
  },
  {
    title: 'Mejor Precio',
    desc: 'Trabajamos directamente con productores para ofrecerte los precios más competitivos del mercado.',
    icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'
  },
  {
    title: 'Calidad Garantizada',
    desc: 'Seleccionamos los mejores productos para garantizar frescura y calidad en cada entrega.',
    icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  }
]
</script>

<style scoped>
.why-us {
  background: white;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 28px;
}

.feature-card {
  padding: 36px 24px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, #f8fdf8, #f0f9f0);
  border: 1px solid rgba(27, 94, 32, 0.08);
  transition: var(--transition);
  text-align: center;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
}

.feature-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--green-dark);
  border-radius: 16px;
  color: white;
}

.feature-card h3 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--green-dark);
  margin-bottom: 10px;
}

.feature-card p {
  font-size: 0.92rem;
  color: #616161;
  line-height: 1.6;
}

@media (max-width: 1024px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
