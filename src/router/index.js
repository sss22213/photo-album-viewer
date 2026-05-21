import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'albums', component: () => import('../views/AlbumList.vue') },
    { path: '/album/:name', name: 'album', component: () => import('../views/PhotoAlbum.vue') },
    { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue') },
    { path: '/merged/:names', name: 'merged', component: () => import('../views/MergedAlbums.vue') },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    // AlbumList is kept-alive and restores its own scroll via onActivated.
    if (to.name === 'albums') return false
    return { top: 0 }
  },
})

export default router
