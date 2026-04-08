import { createRouter, createWebHistory } from 'vue-router';
import IndexPage from './pages/index.vue';
import DashboardPage from './pages/dashboard.vue';
import PubSubPage from './pages/pubsub.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: IndexPage },
    { path: '/dashboard', component: DashboardPage },
    { path: '/pubsub', component: PubSubPage },
  ],
});

// Guard: redirect to / if not connected
router.beforeEach(async (to, _from, next) => {
  if (to.path === '/') return next();

  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      next();
    } else {
      next('/');
    }
  } catch {
    next('/');
  }
});

export default router;
