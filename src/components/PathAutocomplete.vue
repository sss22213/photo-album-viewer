<script setup>
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Directory path' },
  apiBase: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const entries = ref([])
const showList = ref(false)
const activeIndex = ref(-1)
const wrapperEl = ref(null)
let fetchTimer = null
let abortCtrl = null

async function fetchSuggestions(value) {
  if (abortCtrl) abortCtrl.abort()
  abortCtrl = new AbortController()
  try {
    const res = await fetch(
      `${props.apiBase}/api/browse?path=${encodeURIComponent(value)}`,
      { signal: abortCtrl.signal }
    )
    if (!res.ok) {
      entries.value = []
      return
    }
    const data = await res.json()
    entries.value = Array.isArray(data.entries) ? data.entries : []
    activeIndex.value = entries.value.length > 0 ? 0 : -1
  } catch (err) {
    if (err.name !== 'AbortError') entries.value = []
  }
}

function onInput(e) {
  const v = e.target.value
  emit('update:modelValue', v)
  showList.value = true
  if (fetchTimer) clearTimeout(fetchTimer)
  fetchTimer = setTimeout(() => fetchSuggestions(v), 150)
}

function onFocus() {
  showList.value = true
  fetchSuggestions(props.modelValue)
}

function onBlur() {
  // Delay so a click on a suggestion can register before the list closes.
  setTimeout(() => { showList.value = false }, 150)
}

function pick(entry) {
  emit('update:modelValue', entry.path)
  showList.value = false
  // Re-fetch to immediately offer the chosen dir's children.
  fetchSuggestions(entry.path + '/')
}

function onKeydown(e) {
  if (!showList.value || entries.value.length === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % entries.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = activeIndex.value <= 0
      ? entries.value.length - 1
      : activeIndex.value - 1
  } else if (e.key === 'Enter' && activeIndex.value >= 0) {
    e.preventDefault()
    pick(entries.value[activeIndex.value])
  } else if (e.key === 'Escape') {
    showList.value = false
  }
}

watch(() => props.modelValue, (v) => {
  if (showList.value) {
    if (fetchTimer) clearTimeout(fetchTimer)
    fetchTimer = setTimeout(() => fetchSuggestions(v), 150)
  }
})

onUnmounted(() => {
  if (fetchTimer) clearTimeout(fetchTimer)
  if (abortCtrl) abortCtrl.abort()
})
</script>

<template>
  <div class="path-autocomplete" ref="wrapperEl">
    <input
      :value="modelValue"
      :placeholder="placeholder"
      class="form-input"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <ul v-if="showList && entries.length > 0" class="suggestion-list">
      <li
        v-for="(entry, idx) in entries"
        :key="entry.path"
        class="suggestion-item"
        :class="{ active: idx === activeIndex }"
        @mousedown.prevent="pick(entry)"
        @mouseenter="activeIndex = idx"
      >
        <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
        <span class="suggestion-name">{{ entry.name }}</span>
        <span class="suggestion-path">{{ entry.path }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.path-autocomplete {
  position: relative;
  flex: 1;
  min-width: 150px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #0f3460;
  color: #e0e0e0;
  font-size: 15px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #e94560;
}

.suggestion-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: #1a2a4e;
  border: 1px solid #333;
  border-radius: 8px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 50;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: #e0e0e0;
  font-size: 14px;
}

.suggestion-item.active,
.suggestion-item:hover {
  background: #0f3460;
}

.folder-icon {
  flex-shrink: 0;
  color: #e94560;
}

.suggestion-name {
  font-weight: 500;
  white-space: nowrap;
}

.suggestion-path {
  flex: 1;
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}
</style>
