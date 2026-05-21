<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ImagePreview from '../components/ImagePreview.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const photos = ref([])
const albumNames = ref([])
const loading = ref(true)
const selectedIndex = ref(-1)
const loadingAlbums = ref(new Set())

const API_BASE = import.meta.env.VITE_API_URL || ''

const albumNamesParam = route.params.names ? route.params.names.split(',') : []

async function loadAlbum(name) {
  loadingAlbums.value.add(name)
  try {
    const res = await fetch(`${API_BASE}/api/albums/${encodeURIComponent(name)}/photos`)
    const list = await res.json()
    albumNames.value.push(name)
    return list.map(photo => ({
      photo,
      album: name,
      thumbPath: `${API_BASE}/api/albums/thumb?album=${encodeURIComponent(name)}&filename=${encodeURIComponent(photo)}`,
      imgPath: `${API_BASE}/api/albums/img?album=${encodeURIComponent(name)}&filename=${encodeURIComponent(photo)}`,
    }))
  } catch {
    return []
  } finally {
    loadingAlbums.value.delete(name)
  }
}

async function loadPhotos() {
  if (albumNamesParam.length === 0) {
    loading.value = false
    return
  }

  const promises = albumNamesParam.map(name => loadAlbum(name))
  const results = await Promise.all(promises)

  photos.value = results.flat().sort((a, b) => {
    if (a.album < b.album) return -1
    if (a.album > b.album) return 1
    return a.photo.localeCompare(b.photo, undefined, { numeric: true })
  })
  loading.value = false
}

function back() {
  const state = window.history.state
  if (state && state.back === '/') {
    router.back()
  } else {
    router.push('/')
  }
}

onMounted(loadPhotos)
</script>

<template>
  <div>
    <div class="album-header">
      <button class="back-btn" @click="back">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        {{ t('merged.back') }}
      </button>
      <h2 class="album-title">
        {{ t('merged.title', { count: albumNamesParam.length }) }}
      </h2>
    </div>

    <div v-if="loading" class="loading">{{ t('merged.loading') }}</div>
    <div v-else-if="photos.length === 0" class="empty-state">
      <p>{{ t('merged.empty') }}</p>
    </div>
    <div v-else class="photo-grid">
      <div
        v-for="(item, index) in photos"
        :key="item.album + '/' + item.photo"
        class="photo-card"
        @click="selectedIndex = index"
      >
        <img
          :src="item.thumbPath"
          :alt="item.photo"
          loading="lazy"
        />
        <div class="album-label">{{ item.album }}</div>
      </div>
    </div>

    <ImagePreview
      :photos="photos"
      :album="''"
      :initial-index="selectedIndex"
      :api-base="API_BASE"
      @close="selectedIndex = -1"
      :show-album-label="true"
    />
  </div>
</template>

<style scoped>
.album-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
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

.album-title {
  font-size: 28px;
  color: #e94560;
  font-weight: 700;
}

.loading, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #888;
  font-size: 18px;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding-bottom: 80px;
}

@media (max-width: 600px) {
  .photo-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
}

.photo-card {
  position: relative;
  width: 100%;
  padding-top: 100%;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #16213e;
  transition: transform 0.15s, box-shadow 0.15s;
}

.photo-card:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 16px rgba(233,69,96,0.3);
}

.photo-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.album-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 8px;
  background: linear-gradient(transparent, rgba(0,0,0,0.7));
  color: #fff;
  font-size: 12px;
  font-weight: 500;
}
</style>
