<script setup>
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './components/LanguageSwitcher.vue'

const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <div id="app">
    <nav class="navbar">
      <h1 class="logo" @click="router.push('/')">{{ t('app.title') }}</h1>
      <div class="nav-links">
        <LanguageSwitcher />
        <router-link to="/settings" class="nav-link">{{ t('app.settings') }}</router-link>
      </div>
    </nav>
    <main class="main">
      <router-view v-slot="{ Component }">
        <keep-alive include="AlbumList">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
}

#app { min-height: 100vh; }

.navbar {
  background: #16213e;
  padding: 16px 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo {
  font-size: 20px;
  cursor: pointer;
  color: #e94560;
  font-weight: 700;
  letter-spacing: 1px;
  transition: opacity 0.2s;
}

.logo:hover { opacity: 0.7; }

.nav-links {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-link {
  color: #e94560;
  text-decoration: none;
  font-size: 15px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.2s;
}

.nav-link:hover {
  background: #1a2a4e;
}

.nav-link.router-link-active {
  background: #e94560;
  color: white;
}

.main { max-width: 1400px; margin: 0 auto; padding: 24px; }
</style>
