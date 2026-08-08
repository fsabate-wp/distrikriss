import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/producto/:slug', name: 'product', component: () => import('../views/ProductView.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { guest: true } },
  { path: '/registro', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { guest: true } },
  { path: '/checkout', name: 'checkout', component: () => import('../views/CheckoutView.vue'), meta: { requiresAuth: true } },
  { path: '/perfil', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },
  { path: '/perfil/direcciones/nueva', name: 'address-new', component: () => import('../views/AddressFormView.vue'), meta: { requiresAuth: true } },
  { path: '/perfil/direcciones/:id', name: 'address-edit', component: () => import('../views/AddressFormView.vue'), meta: { requiresAuth: true } },
  { path: '/pedidos', name: 'orders', component: () => import('../views/OrdersView.vue'), meta: { requiresAuth: true } },
  { path: '/pedidos/:id', name: 'order-detail', component: () => import('../views/OrderDetailView.vue'), meta: { requiresAuth: true } },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { requiresAdmin: true },
    children: [
      { path: '', name: 'admin', component: () => import('../views/admin/AdminDashboard.vue') },
      { path: 'productos', name: 'admin-products', component: () => import('../views/admin/AdminProducts.vue') },
      { path: 'productos/nuevo', name: 'admin-product-new', component: () => import('../views/admin/AdminProductForm.vue') },
      { path: 'productos/:id', name: 'admin-product-edit', component: () => import('../views/admin/AdminProductForm.vue') },
      { path: 'categorias', name: 'admin-categories', component: () => import('../views/admin/AdminCategories.vue') },
      { path: 'pedidos', name: 'admin-orders', component: () => import('../views/admin/AdminOrders.vue') },
      { path: 'pedidos/:id', name: 'admin-order-detail', component: () => import('../views/admin/AdminOrderDetail.vue') },
      { path: 'clientes', name: 'admin-clients', component: () => import('../views/admin/AdminClients.vue') },
      { path: 'facturas', name: 'admin-invoices', component: () => import('../views/admin/AdminInvoices.vue') },
      {
        path: 'configuracion',
        name: 'admin-settings',
        component: () => import('../views/admin/AdminSettings.vue'),
        children: [
          { path: '', name: 'admin-settings-general', component: () => import('../views/admin/AdminSettingsGeneral.vue') },
          { path: 'apariencia', name: 'admin-settings-appearance', component: () => import('../views/admin/AdminSettingsAppearance.vue') },
          { path: 'entregas', name: 'admin-settings-delivery', component: () => import('../views/admin/AdminSettingsDelivery.vue') },
          { path: 'horarios', name: 'admin-settings-schedule', component: () => import('../views/admin/AdminSettingsSchedule.vue') },
          { path: 'pagos', name: 'admin-settings-payments', component: () => import('../views/admin/AdminSettingsPayments.vue') },
          { path: 'facturacion', name: 'admin-settings-billing', component: () => import('../views/admin/AdminSettingsBilling.vue') },
        ],
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) {
    await auth.fetchMe()
  }
  if (to.meta.requiresAuth && !auth.isAuthed) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' }
  }
  if (to.meta.guest && auth.isAuthed) {
    return { name: 'home' }
  }
})

export default router
