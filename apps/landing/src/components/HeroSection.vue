<template>
  <section class="hero">
    <div class="hero-bg">
      <div class="hero-bg-image"></div>
      <div class="hero-bg-overlay"></div>
    </div>
    <div class="container hero-content">
      <div class="hero-badge">Distribuidora de Alimentos</div>
      <h1 class="hero-title">
        <span class="hero-distri">Distri</span><span class="hero-kriss">Kriss</span>
      </h1>
      <p class="hero-slogan">Lo Mejor en precio y calidad</p>
      <p class="hero-desc">Al por mayor y menor. Frutas, legumbres, lácteos, carnes, pollos, embutidos, abastos y plásticos.</p>
      <div class="hero-actions">
        <a
          href="https://wa.me/593959841957?text=Hola%20DistriKriss%2C%20me%20interesa%20hacer%20un%20pedido"
          class="btn btn-whatsapp btn-lg"
          target="_blank"
          rel="noopener"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Hacer pedido por WhatsApp
        </a>
        <a href="#productos" class="btn btn-outline btn-lg">
          Ver productos
        </a>
        <a :href="appUrl + '/registro'" class="btn btn-primary btn-lg">
          Pedir online
        </a>
      </div>
    </div>
    <div class="hero-wave">
      <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="white"/>
      </svg>
    </div>
  </section>
</template>

<script setup>
const appUrl = import.meta.env.VITE_APP_URL || 'https://app.distrikriss.com'
</script>

<style scoped>
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.hero-bg-image {
  position: absolute;
  inset: 0;
  background: url('/imgs/bg-distrikriss.webp') center/cover no-repeat;
  z-index: 0;
}

.hero-bg-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(27, 94, 32, 0.92) 0%, rgba(46, 125, 50, 0.88) 40%, rgba(67, 160, 71, 0.82) 70%, rgba(102, 187, 106, 0.78) 100%);
  z-index: 1;
}

.hero-bg::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  z-index: 2;
}

.hero-bg::after {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  z-index: 2;
}

.hero-content {
  position: relative;
  z-index: 2;
  padding-top: 100px;
  padding-bottom: 120px;
}

.hero-badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  color: white;
  padding: 8px 20px;
  border-radius: 50px;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 24px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.hero-title {
  font-size: clamp(3rem, 8vw, 5.5rem);
  font-weight: 900;
  line-height: 1.05;
  margin-bottom: 16px;
}

.hero-distri {
  color: white;
}

.hero-kriss {
  color: #EF5350;
}

.hero-slogan {
  font-size: clamp(1.1rem, 2.5vw, 1.5rem);
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  margin-bottom: 16px;
  font-style: italic;
}

.hero-desc {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  max-width: 550px;
  margin-bottom: 36px;
  line-height: 1.7;
}

.hero-actions {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.btn-lg {
  padding: 18px 40px;
  font-size: 1.05rem;
}

.btn-outline {
  background: transparent;
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.btn-outline:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: white;
  transform: translateY(-2px);
}

.hero-wave {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 3;
  line-height: 0;
}

.hero-wave svg {
  width: 100%;
  height: 80px;
}

@media (max-width: 768px) {
  .hero-content {
    padding-top: 120px;
    padding-bottom: 100px;
  }

  .hero-actions {
    flex-direction: column;
  }

  .btn-lg {
    padding: 16px 32px;
    justify-content: center;
  }
}
</style>
