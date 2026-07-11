<template>
  <section id="ubicacion" class="section map-section">
    <div class="container">
      <h2 class="section-title">Nuestra Ubicación</h2>
      <p class="section-subtitle">Encuéntranos en Cdla. Guangala villa 24 Mz. E7</p>
      <div class="map-wrapper">
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3987.5!2d-79.9!3d-2.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMsKwMTInMDAuMCJTIDc5wrA1NCcwMC4wIlc!5e0!3m2!1ses!2sec!4v1"
          width="100%"
          height="450"
          style="border:0; border-radius: var(--radius);"
          allowfullscreen=""
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Ubicación de DistriKriss"
        ></iframe>
      </div>
    </div>
  </section>
</template>

<style scoped>
.map-section {
  background: var(--gray-light);
}

.map-wrapper {
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
}

@media (max-width: 768px) {
  .map-wrapper iframe {
    height: 300px;
  }
}
</style>
