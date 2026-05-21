<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PathAutocomplete from '../components/PathAutocomplete.vue'

const { t } = useI18n()

const router = useRouter()
const settings = ref({ sources: [], enabledAlbums: [] })
const rescanning = ref(false)
const allAlbums = ref([])
const sources = ref([])
const loading = ref(true)
const addingAlbum = ref(false)
const addingSource = ref(false)
const newAlbumName = ref('')
const newAlbumPath = ref('')
const newSourceName = ref('')
const newSourcePath = ref('')

const API_BASE = import.meta.env.VITE_API_URL || ''

function isAlbumEnabled(albumName) {
  return settings.value.enabledAlbums.includes(albumName)
}

function toggleAlbum(albumName) {
  const albums = [...settings.value.enabledAlbums]
  const idx = albums.indexOf(albumName)
  if (idx >= 0) {
    albums.splice(idx, 1)
  } else {
    albums.push(albumName)
  }
  settings.value.enabledAlbums = albums
  saveSettings()
}

async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`)
    settings.value = await res.json()
  } catch {
    settings.value = { sources: [], enabledAlbums: [] }
  }
}

async function loadAllAlbums() {
  try {
    const res = await fetch(`${API_BASE}/api/albums-manifest`)
    allAlbums.value = await res.json()
  } catch {
    allAlbums.value = []
  }
}

async function loadSources() {
  try {
    const res = await fetch(`${API_BASE}/api/sources`)
    sources.value = await res.json()
  } catch {
    sources.value = []
  }
}

async function saveSettings() {
  try {
    await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: settings.value.sources,
        enabledAlbums: settings.value.enabledAlbums,
      }),
    })
  } catch {
    console.error('Failed to save settings')
  }
}

async function addSource() {
  if (!newSourceName.value.trim() || !newSourcePath.value.trim()) return
  addingSource.value = true
  try {
    const res = await fetch(`${API_BASE}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newSourceName.value.trim(),
        albumPath: newSourcePath.value.trim(),
      }),
    })
    if (res.ok) {
      newSourceName.value = ''
      newSourcePath.value = ''
      await Promise.all([loadSources(), loadAllAlbums(), loadSettings()])
    } else {
      const err = await res.json()
      alert(err.error || t('settings.sources.addFailed'))
    }
  } catch {
    alert(t('settings.sources.addFailed'))
  } finally {
    addingSource.value = false
  }
}

async function removeSource(name) {
  if (!confirm(t('settings.sources.removeConfirm', { name }))) return
  try {
    await fetch(`${API_BASE}/api/sources/${encodeURIComponent(name)}`, { method: 'DELETE' })
    await Promise.all([loadSources(), loadAllAlbums(), loadSettings()])
  } catch {
    alert(t('settings.sources.removeFailed'))
  }
}

async function removeAlbum(albumName) {
  if (!confirm(t('settings.enabled.removeConfirm', { name: albumName }))) return
  const slashIdx = albumName.indexOf('/')
  let src = '', name = albumName
  if (slashIdx !== -1) {
    src = albumName.substring(0, slashIdx)
    name = albumName.substring(slashIdx + 1)
  }
  try {
    await fetch(`${API_BASE}/api/albums/${encodeURIComponent(src)}/${encodeURIComponent(name)}`, { method: 'DELETE' })
    settings.value.enabledAlbums = settings.value.enabledAlbums.filter(a => a !== albumName)
    saveSettings()
    await Promise.all([loadAllAlbums(), loadSources()])
  } catch {
    alert(t('settings.enabled.removeFailed'))
  }
}

async function addManualAlbum() {
  if (!newAlbumName.value.trim() || !newAlbumPath.value.trim()) return
  addingAlbum.value = true
  try {
    const res = await fetch(`${API_BASE}/api/albums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newAlbumName.value.trim(),
        path: newAlbumPath.value.trim(),
      }),
    })
    if (res.ok) {
      newAlbumName.value = ''
      newAlbumPath.value = ''
      await Promise.all([loadAllAlbums(), loadSettings()])
    } else {
      const err = await res.json()
      alert(err.error || t('settings.manual.addFailed'))
    }
  } catch {
    alert(t('settings.manual.addFailed'))
  } finally {
    addingAlbum.value = false
  }
}

async function rescanAlbums() {
  try {
    rescanning.value = true
    await fetch(`${API_BASE}/api/scan`, { method: 'POST' })
    await Promise.all([loadAllAlbums(), loadSources()])
    alert(t('settings.enabled.rescanDone'))
  } catch {
    alert(t('settings.enabled.rescanFailed'))
  } finally {
    rescanning.value = false
  }
}

onMounted(() => {
  loadSettings()
  loadAllAlbums()
  loadSources()
})
</script>

<template>
  <div>
    <div class="settings-header">
      <button class="back-btn" @click="router.push('/')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        {{ t('settings.back') }}
      </button>
      <h2 class="page-title">{{ t('settings.title') }}</h2>
    </div>

    <!-- Sources -->
    <div class="settings-section">
      <h3 class="section-title">{{ t('settings.sources.title') }}</h3>
      <p class="section-desc">{{ t('settings.sources.desc') }}</p>

      <div class="source-list">
        <div v-for="src in sources" :key="src.name" class="source-item">
          <div class="source-info">
            <div class="source-name">{{ src.name }}</div>
            <div class="source-path">{{ src.path }}</div>
          </div>
          <button class="remove-btn" @click="removeSource(src.name)">{{ t('settings.remove') }}</button>
        </div>
      </div>

      <div class="add-form">
        <input
          v-model="newSourceName"
          :placeholder="t('settings.sources.namePlaceholder')"
          class="form-input"
        />
        <PathAutocomplete
          v-model="newSourcePath"
          :placeholder="t('settings.sources.pathPlaceholder')"
          :api-base="API_BASE"
        />
        <button
          class="add-btn"
          @click="addSource"
          :disabled="!newSourceName.trim() || !newSourcePath.trim() || addingSource"
        >
          {{ addingSource ? t('settings.sources.adding') : t('settings.sources.add') }}
        </button>
      </div>
    </div>

    <!-- Albums to enable/disable -->
    <div class="settings-section">
      <h3 class="section-title">{{ t('settings.enabled.title') }}</h3>
      <p class="section-desc">{{ t('settings.enabled.desc') }}</p>
      <button class="rescan-btn" @click="rescanAlbums" :disabled="rescanning">
        {{ rescanning ? t('settings.enabled.rescanning') : t('settings.enabled.rescan') }}
      </button>
      <div class="album-toggle-list">
        <label v-for="album in allAlbums" :key="album.name" class="album-toggle-item">
          <input
            type="checkbox"
            :checked="isAlbumEnabled(album.name)"
            @change="toggleAlbum(album.name)"
          />
          <span class="toggle-name">{{ album.name }}</span>
          <span class="toggle-count">{{ t('albums.photoCount', { count: album.photoCount }) }}</span>
          <button class="remove-btn" @click.prevent="removeAlbum(album.name)">{{ t('settings.remove') }}</button>
        </label>
      </div>
    </div>

    <!-- Manual album -->
    <div class="settings-section">
      <h3 class="section-title">{{ t('settings.manual.title') }}</h3>
      <p class="section-desc">{{ t('settings.manual.desc') }}</p>
      <div class="add-form">
        <input
          v-model="newAlbumName"
          :placeholder="t('settings.manual.namePlaceholder')"
          class="form-input"
        />
        <PathAutocomplete
          v-model="newAlbumPath"
          :placeholder="t('settings.manual.pathPlaceholder')"
          :api-base="API_BASE"
        />
        <button
          class="add-btn"
          @click="addManualAlbum"
          :disabled="!newAlbumName.trim() || !newAlbumPath.trim() || addingAlbum"
        >
          {{ addingAlbum ? t('settings.manual.adding') : t('settings.manual.add') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  color: #e94560;
  font-weight: 700;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #16213e;
  color: #e94560;
  border: 1px solid #e94560;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.back-btn:hover {
  background: #1a2a4e;
}

.settings-section {
  margin-bottom: 32px;
  background: #16213e;
  border-radius: 12px;
  padding: 20px;
}

.section-title {
  font-size: 20px;
  color: #e94560;
  margin-bottom: 8px;
}

.section-desc {
  font-size: 14px;
  color: #888;
  margin-bottom: 16px;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #0f3460;
  border-radius: 8px;
}

.source-name {
  font-size: 15px;
  font-weight: 600;
  color: #e94560;
}

.source-path {
  font-size: 12px;
  color: #888;
  word-break: break-all;
}

.album-toggle-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.album-toggle-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  transition: background 0.15s;
}

.album-toggle-item:hover {
  background: rgba(255,255,255,0.05);
}

.album-toggle-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #e94560;
}

.toggle-name {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}

.toggle-count {
  font-size: 13px;
  color: #888;
}

.remove-btn {
  padding: 4px 12px;
  background: transparent;
  color: #e94560;
  border: 1px solid #e94560;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.remove-btn:hover {
  background: #e94560;
  color: white;
}

.add-form {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.form-input {
  flex: 1;
  min-width: 150px;
  padding: 10px 14px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #0f3460;
  color: #e0e0e0;
  font-size: 15px;
}

.form-input:focus {
  outline: none;
  border-color: #e94560;
}

.add-btn {
  padding: 10px 20px;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: opacity 0.2s;
  white-space: nowrap;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.rescan-btn {
  padding: 10px 20px;
  background: #0f3460;
  color: #e94560;
  border: 1px solid #e94560;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
  transition: background 0.2s;
}

.rescan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rescan-btn:hover:not(:disabled) {
  background: #e94560;
  color: white;
}
</style>
