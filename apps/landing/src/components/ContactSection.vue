<template>
  <section id="contacto" class="section contact-section">
    <div class="container">
      <h2 class="section-title">Contáctanos</h2>
      <p class="section-subtitle">Estamos listos para atenderte</p>
      <div class="contact-grid">
        <a
          href="https://wa.me/593959841957?text=Hola%20DistriKriss%2C%20me%20interesa%20hacer%20un%20pedido"
          class="contact-card whatsapp-card"
          target="_blank"
          rel="noopener"
        >
          <div class="contact-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </div>
          <h3>WhatsApp</h3>
          <p>095 984 1957</p>
          <span class="contact-cta">Escríbenos ahora</span>
        </a>
        <div class="contact-card">
          <div class="contact-icon location-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <h3>Dirección</h3>
          <p>Cdla. Guangala villa 24<br />Mz. E7</p>
        </div>
        <div class="contact-card">
          <div class="contact-icon schedule-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h3>Horario</h3>
          <p>Lunes a Sábado<br />7:00 AM - 6:00 PM</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.contact-section {
  background: linear-gradient(135deg, var(--green-dark), var(--green-mid));
}

.contact-section .section-title {
  color: white;
}

.contact-section .section-subtitle {
  color: rgba(255, 255, 255, 0.7);
}

.contact-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.contact-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius);
  padding: 36px 24px;
  text-align: center;
  transition: var(--transition);
  display: block;
}

a.contact-card:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-4px);
}

.contact-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: white;
}

.whatsapp-card .contact-icon {
  background: #25D366;
}

.location-icon {
  background: rgba(255, 255, 255, 0.2);
}

.schedule-icon {
  background: rgba(255, 255, 255, 0.2);
}

.contact-card h3 {
  font-size: 1.2rem;
  font-weight: 700;
  color: white;
  margin-bottom: 8px;
}

.contact-card p {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
}

.contact-cta {
  display: inline-block;
  margin-top: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #25D366;
}

@media (max-width: 768px) {
  .contact-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
