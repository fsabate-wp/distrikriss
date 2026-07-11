<template>
  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <span class="brand-distri">Distri</span><span class="brand-kriss">Kriss</span>
        <p class="footer-slogan">Lo Mejor en precio y calidad</p>
      </div>
      <div class="footer-links">
        <a href="#productos">Productos</a>
        <a href="#nosotros">Nosotros</a>
        <a href="#ubicacion">Ubicación</a>
        <a href="#contacto">Contacto</a>
      </div>
      <div class="footer-social">
        <a
          href="https://wa.me/593959841957?text=Hola%20DistriKriss%2C%20me%20interesa%20hacer%20un%20pedido"
          target="_blank"
          rel="noopener"
          aria-label="WhatsApp"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="container">
        <p>&copy; {{ currentYear }} DistriKriss. Todos los derechos reservados.</p>
      </div>
    </div>
  </footer>
</template>

<script setup>
const currentYear = new Date().getFullYear()
</script>

<style scoped>
.footer {
  background: var(--dark);
  color: white;
  padding-top: 60px;
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 40px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  gap: 32px;
}

.footer-brand .brand-distri {
  font-size: 1.5rem;
  font-weight: 900;
  color: white;
}

.footer-brand .brand-kriss {
  font-size: 1.5rem;
  font-weight: 900;
  color: var(--red);
}

.footer-slogan {
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
  font-size: 0.9rem;
}

.footer-links {
  display: flex;
  gap: 28px;
}

.footer-links a {
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  font-size: 0.95rem;
  transition: var(--transition);
}

.footer-links a:hover {
  color: white;
}

.footer-social a {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  transition: var(--transition);
}

.footer-social a:hover {
  background: #25D366;
  transform: scale(1.1);
}

.footer-bottom {
  padding: 20px 0;
}

.footer-bottom p {
  text-align: center;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.4);
}

@media (max-width: 768px) {
  .footer-inner {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .footer-links {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
