<script setup>
import { ref, onMounted, onActivated, onBeforeUnmount, onDeactivated, computed, nextTick } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineOptions({ name: 'AlbumList' })

const SCROLL_KEY = 'albums-scroll-y'

function getCurrentScrollY() {
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
}

function saveScroll() {
  sessionStorage.setItem(SCROLL_KEY, String(getCurrentScrollY()))
}

function restoreScroll() {
  const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10)
  if (!y || y <= 0) return
  // Wait for Vue patch + browser layout before scrolling. Mobile browsers
  // clamp scrollTo to current document height, so we must run after the
  // album grid is laid out at full height.
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, y)
      })
    })
  })
}

onBeforeRouteLeave(() => { saveScroll() })
onDeactivated(() => { saveScroll() })
onBeforeUnmount(() => { saveScroll() })
onActivated(() => { restoreScroll() })

const router = useRouter()
const albums = ref([])
const settings = ref({ enabledAlbums: [] })
const loading = ref(true)
const selectedAlbums = ref(new Set())
const viewMode = ref('single')
const showSources = ref(false)

const API_BASE = import.meta.env.VITE_API_URL || ''

const groupedAlbums = computed(() => {
  const groups = []
  const sourceAlbums = {}
  const manualAlbums = []

  albums.value.forEach(album => {
    const slashIdx = album.name.indexOf('/')
    if (slashIdx !== -1) {
      const source = album.name.substring(0, slashIdx)
      if (!sourceAlbums[source]) sourceAlbums[source] = []
      sourceAlbums[source].push(album)
    } else {
      manualAlbums.push(album)
    }
  })

  Object.keys(sourceAlbums).sort().forEach(source => {
    groups.push({
      type: 'source',
      name: source,
      albums: sourceAlbums[source],
    })
  })

  if (manualAlbums.length > 0) {
    groups.push({ type: 'manual', name: 'Manual', albums: manualAlbums })
  }

  return groups
})

const isAlbumSelected = (albumName) => {
  return selectedAlbums.value.has(albumName)
}

async function loadAlbums() {
  try {
    const [albumsRes, settingsRes] = await Promise.all([
      fetch(`${API_BASE}/api/albums-manifest`),
      fetch(`${API_BASE}/api/settings`),
    ])
    albums.value = await albumsRes.json()
    settings.value = await settingsRes.json()
  } catch {
    albums.value = []
    settings.value = { enabledAlbums: [] }
  } finally {
    loading.value = false
  }
}

function openAlbum(name) {
  if (viewMode.value === 'single') {
    router.push({ name: 'album', params: { name } })
  } else {
    toggleSelection(name)
  }
}

function toggleSelection(name) {
  if (selectedAlbums.value.has(name)) {
    selectedAlbums.value.delete(name)
  } else {
    selectedAlbums.value.add(name)
  }
}

function toggleSelectAll() {
  if (selectedAlbums.value.size === albums.value.length) {
    selectedAlbums.value.clear()
  } else {
    albums.value.forEach(a => selectedAlbums.value.add(a.name))
  }
}

function viewSelectedAlbums() {
  if (selectedAlbums.value.size === 0) {
    alert(t('albums.selectAtLeastOne'))
    return
  }
  const names = Array.from(selectedAlbums.value).join(',')
  router.push({ name: 'merged', params: { names } })
}

function formatCount(n) {
  return t('albums.photoCount', { count: n })
}

function isAllSelected() {
  return albums.value.length > 0 && selectedAlbums.value.size === albums.value.length
}

function countSelected() {
  return selectedAlbums.value.size
}

onMounted(async () => {
  await loadAlbums()
  // After albums render, restore scroll if returning from a child page.
  restoreScroll()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">{{ t('albums.title') }}</h2>
      <div class="view-controls">
        <button
          class="view-btn"
          :class="{ active: viewMode === 'single' }"
          @click="viewMode = 'single'"
        >
          {{ t('albums.single') }}
        </button>
        <button
          class="view-btn"
          :class="{ active: viewMode === 'multi' }"
          @click="viewMode = 'multi'"
        >
          {{ t('albums.multi') }}
        </button>
        <button
          class="view-btn sources-btn"
          :class="{ active: showSources }"
          @click="showSources = !showSources"
        >
          {{ t('albums.sources') }}
        </button>
      </div>
    </div>

    <div v-if="viewMode === 'multi' && albums.length > 0" class="multi-bar">
      <button class="select-all-btn" @click="toggleSelectAll">
        {{ isAllSelected() ? t('albums.deselectAll') : t('albums.selectAll') }} ({{ countSelected() }})
      </button>
      <button
        class="view-selected-btn"
        @click="viewSelectedAlbums"
        :disabled="selectedAlbums.size === 0"
      >
        {{ t('albums.viewSelected') }} ({{ selectedAlbums.size }})
      </button>
    </div>

    <div v-if="loading" class="loading">{{ t('albums.loading') }}</div>
    <div v-else-if="albums.length === 0" class="empty-state">
      <p>{{ t('albums.empty') }}</p>
      <p class="hint">{{ t('albums.emptyHint') }}</p>
    </div>
    <div v-else class="album-grid">
      <!-- Source Labels (full-width rows) & Album Cards (direct grid children) -->
      <template v-for="(group, gi) in groupedAlbums" :key="group.name">
        <div
          v-if="showSources"
          class="source-label"
          :class="{ 'manual-label': group.type === 'manual' }"
        >
          {{ group.type === 'manual' ? t('albums.manual') : group.name }}
        </div>
        <div
          v-for="album in group.albums"
          :key="album.name"
          class="album-card"
          :class="{ selected: viewMode === 'multi' && isAlbumSelected(album.name) }"
          @click="openAlbum(album.name)"
        >
          <div class="album-cover">
            <img
              v-if="album.coverFile"
              :src="`${API_BASE}/api/albums/thumb?album=${encodeURIComponent(album.name)}&filename=${encodeURIComponent(album.coverFile)}`"
              :alt="album.name"
              loading="lazy"
            />
            <div v-else class="album-placeholder">
              <span class="folder-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="#e94560">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
              </span>
            </div>
          </div>
          <div class="album-info">
            <div class="album-name-row">
              <h3 class="album-name">{{ album.name }}</h3>
              <input
                v-if="viewMode === 'multi'"
                type="checkbox"
                :checked="isAlbumSelected(album.name)"
                @click.stop="toggleSelection(album.name)"
                class="album-checkbox"
              />
            </div>
            <p class="album-count">{{ formatCount(album.photoCount) }}</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  color: #e94560;
}

.view-controls {
  display: flex;
  gap: 8px;
}

.view-btn {
  padding: 8px 16px;
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #333;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s, border-color 0.2s;
}

.view-btn.active {
  background: #e94560;
  border-color: #e94560;
  color: white;
}

.view-btn:hover:not(.active) {
  background: #1a2a4e;
  border-color: #e94560;
}

.sources-btn {
  background: #0f3460;
  border-color: #0f3460;
}

.multi-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.select-all-btn {
  padding: 8px 16px;
  background: #16213e;
  color: #e94560;
  border: 1px solid #e94560;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.select-all-btn:hover {
  background: #1a2a4e;
}

.view-selected-btn {
  padding: 8px 16px;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: opacity 0.2s;
}

.view-selected-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.view-selected-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.album-card.selected {
  border: 2px solid #e94560;
}

.source-label {
  grid-column: 1 / -1;
  font-size: 18px;
  font-weight: 600;
  color: #e94560;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.manual-label {
  font-size: 16px;
  color: #888;
}

.album-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.album-checkbox {
  width: 18px;
  height: 18px;
  accent-color: #e94560;
  flex-shrink: 0;
}

.loading, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #888;
  font-size: 18px;
}

.empty-state .hint {
  font-size: 14px;
  color: #666;
  margin-top: 8px;
}

.album-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

@media (max-width: 1400px) {
  .album-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1000px) {
  .album-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .album-grid {
    grid-template-columns: 1fr;
  }
}

.album-card {
  background: #16213e;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.album-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(233,69,96,0.2);
}

.album-cover {
  width: 100%;
  aspect-ratio: 4/3;
  background: #0f3460;
  overflow: hidden;
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.2s;
}

.album-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.album-info {
  padding: 14px 16px;
}

.album-name {
  font-size: 16px;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-count {
  font-size: 13px;
  color: #888;
  margin-top: 4px;
}
</style>
