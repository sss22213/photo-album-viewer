<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  photos: { type: Array, required: true },
  album: { type: String, required: true },
  initialIndex: { type: Number, default: -1 },
  apiBase: { type: String, default: '' },
  showAlbumLabel: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const currentIndex = ref(-1)
const scrollContainer = ref(null)

// Detect if photos are objects (merged view) or strings (single album)
const isMergedView = computed(() => props.photos.length > 0 && typeof props.photos[0] === 'object')

const currentPhoto = computed(() => {
  if (currentIndex.value < 0) return ''
  const photo = props.photos[currentIndex.value]
  if (isMergedView.value) return photo.photo
  return photo
})

const thumbUrl = computed(() => {
  if (currentIndex.value < 0) return ''
  const photo = props.photos[currentIndex.value]
  if (isMergedView.value) return photo.thumbPath
  return `${props.apiBase}/api/albums/thumb?album=${encodeURIComponent(props.album)}&filename=${encodeURIComponent(photo)}`
})

const imgUrl = computed(() => {
  if (currentIndex.value < 0) return ''
  const photo = props.photos[currentIndex.value]
  if (isMergedView.value) return photo.imgPath
  return `${props.apiBase}/api/albums/img?album=${encodeURIComponent(props.album)}&filename=${encodeURIComponent(photo)}`
})

const albumName = computed(() => {
  if (currentIndex.value < 0) return ''
  if (isMergedView.value) {
    const photo = props.photos[currentIndex.value]
    return photo.album
  }
  return props.album
})

function open(index) {
  currentIndex.value = index
}

function close() {
  emit('close')
  currentIndex.value = -1
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

function next() {
  if (currentIndex.value < props.photos.length - 1) currentIndex.value++
}

function scrollToCurrent() {
  if (!scrollContainer.value || currentIndex.value < 0) return
  const cards = scrollContainer.value.querySelectorAll('.preview-nav-item')
  const target = cards[currentIndex.value]
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
}

watch(() => currentIndex.value, scrollToCurrent)

watch(() => props.initialIndex, (val) => {
  if (val >= 0 && val < props.photos.length) {
    currentIndex.value = val
  } else if (val === -1) {
    currentIndex.value = -1
  }
})

function onKeydown(e) {
  if (currentIndex.value < 0) return
  if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

watch(() => currentIndex.value, (val) => {
  document.body.style.overflow = val >= 0 ? 'hidden' : ''
})

function formatPhotoCount(n) {
  return `${n + 1} / ${props.photos.length}`
}
</script>

<template>
  <Teleport to="body">
    <div class="preview-overlay" v-show="currentIndex >= 0">
      <!-- Top bar -->
      <div class="preview-top-bar">
        <button class="close-btn" @click="close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
        <span class="photo-counter">{{ formatPhotoCount(currentIndex) }}</span>
      </div>

      <!-- Thumbnail strip (scrollable) -->
      <div class="preview-strip-wrapper">
        <div ref="scrollContainer" class="preview-strip">
          <div
            v-for="(photo, index) in photos"
            :key="isMergedView ? photo.photo : photo"
            class="preview-nav-item"
            :class="{ active: index === currentIndex }"
            @click="open(index)"
          >
            <img
              :src="isMergedView ? photo.thumbPath : `${apiBase}/api/albums/thumb?album=${encodeURIComponent(album)}&filename=${encodeURIComponent(photo)}`"
              :alt="isMergedView ? photo.photo : photo"
            />
          </div>
        </div>
      </div>

      <!-- Main image area -->
      <div class="preview-main">
        <button class="nav-btn nav-prev" @click="prev" v-if="currentIndex > 0">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
        <button class="nav-btn nav-next" @click="next" v-if="currentIndex < photos.length - 1">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
        <img
          class="preview-image"
          :src="imgUrl"
          :alt="currentPhoto"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: rgba(0,0,0,0.95);
  animation: fadeIn 0.15s;
}

@keyframes fadeIn {
  from { opacity: 0; } to { opacity: 1; }
}

.preview-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  z-index: 10;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.close-btn:hover { opacity: 1; }

.photo-counter {
  color: #fff;
  font-size: 14px;
  opacity: 0.7;
}

.preview-strip-wrapper {
  flex-shrink: 0;
  padding: 8px 0;
}

.preview-strip {
  display: flex;
  gap: 6px;
  padding: 0 16px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.preview-strip::-webkit-scrollbar { display: none; }

.preview-nav-item {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  opacity: 0.4;
  border: 2px solid transparent;
  transition: opacity 0.2s, border-color 0.2s;
}

.preview-nav-item.active {
  opacity: 1;
  border-color: #e94560;
}

.preview-nav-item:hover { opacity: 0.8; }

.preview-nav-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.preview-image {
  max-width: 90vw;
  max-height: calc(100vh - 280px);
  object-fit: contain;
  user-select: none;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255,255,255,0.1);
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 12px;
  border-radius: 50%;
  opacity: 0.6;
  transition: opacity 0.2s, background 0.2s;
  z-index: 5;
}

.nav-btn:hover {
  opacity: 1;
  background: rgba(255,255,255,0.2);
}

.nav-prev { left: 12px; }
.nav-next { right: 12px; }
</style>
