<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, setLocale } from '../i18n'

const { locale, t } = useI18n()
const open = ref(false)
const wrapperEl = ref(null)

function pick(code) {
  setLocale(code)
  open.value = false
}

function onDocClick(e) {
  if (wrapperEl.value && !wrapperEl.value.contains(e.target)) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div ref="wrapperEl" class="lang-switcher">
    <button
      class="lang-trigger"
      :aria-label="t('language.label')"
      :title="t('language.label')"
      @click="open = !open"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/>
      </svg>
    </button>
    <ul v-if="open" class="lang-menu">
      <li
        v-for="code in SUPPORTED_LOCALES"
        :key="code"
        class="lang-item"
        :class="{ active: locale === code }"
        @click="pick(code)"
      >
        {{ t(`language.${code}`) }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lang-switcher {
  position: relative;
  display: inline-block;
}

.lang-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: transparent;
  color: #e94560;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.lang-trigger:hover {
  background: #1a2a4e;
  border-color: #e94560;
}

.lang-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: #1a2a4e;
  border: 1px solid #333;
  border-radius: 8px;
  min-width: 140px;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.lang-item {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: #e0e0e0;
  font-size: 14px;
  white-space: nowrap;
}

.lang-item:hover {
  background: #0f3460;
}

.lang-item.active {
  background: #e94560;
  color: white;
}
</style>
