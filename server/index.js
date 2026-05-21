import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const app = express()
const PORT = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parse JSON request bodies
app.use(express.json())

// Allowed image extensions
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'])
const THUMB_SIZE = 400

// Cache directory for manifest, thumbnails, and settings
const CACHE_DIR = path.resolve(process.cwd(), 'cache')
const THUMB_CACHE_DIR = path.join(CACHE_DIR, 'thumbnails')
const MANIFEST_CACHE_FILE = path.join(CACHE_DIR, 'manifest.json')

// Settings file: { sources: [{name, path}], enabledAlbums: ['source/album'] }
// Lives inside CACHE_DIR so a single mounted volume persists all state.
// Falls back to legacy /app/settings.json if present (for users upgrading).
const LEGACY_SETTINGS_FILE = path.resolve(process.cwd(), 'settings.json')
const SETTINGS_FILE = (fs.existsSync(LEGACY_SETTINGS_FILE) && !fs.existsSync(path.join(CACHE_DIR, 'settings.json')))
  ? LEGACY_SETTINGS_FILE
  : path.join(CACHE_DIR, 'settings.json')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
      // Migrate old format: { albums: [...] } -> { sources: [], enabledAlbums: [...] }
      if (!raw.sources && !raw.enabledAlbums) {
        if (Array.isArray(raw.albums)) {
          return { sources: [], enabledAlbums: raw.albums }
        }
        return { sources: [], enabledAlbums: [] }
      }
      // Ensure both fields exist
      return { sources: raw.sources || [], enabledAlbums: raw.enabledAlbums || [] }
    }
  } catch {}
  return { sources: [], enabledAlbums: [] }
}

function saveSettings(settings) {
  ensureDir(path.dirname(SETTINGS_FILE))
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

// API: get settings
app.get('/api/settings', (req, res) => {
  res.json(loadSettings())
})

// API: update settings
app.put('/api/settings', (req, res) => {
  const { sources, enabledAlbums } = req.body
  saveSettings({ sources: sources || [], enabledAlbums: enabledAlbums || [] })
  res.json({ ok: true })
})

// API: get sources
app.get('/api/sources', (req, res) => {
  const settings = loadSettings()
  const cached = loadManifestCache()
  const sources = settings.sources.map(s => {
    const sourceAlbums = cached
      ? cached.filter(a => a.name.startsWith(s.name + '/')).map(a => ({
          name: a.name.substring(s.name.length + 1),
          photoCount: a.photoCount,
          coverFile: a.coverFile,
        }))
      : []
    return { name: s.name, path: s.path, albums: sourceAlbums }
  })
  res.json(sources)
})

// API: add a source
app.post('/api/sources', (req, res) => {
  const { name, albumPath } = req.body
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' })
  if (!albumPath || typeof albumPath !== 'string') return res.status(400).json({ error: 'path required' })
  const resolved = path.resolve(albumPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(400).json({ error: 'path does not exist or is not a directory' })
  }
  const settings = loadSettings()
  if (settings.sources.some(s => s.name === name)) {
    return res.status(409).json({ error: 'source name already exists' })
  }
  settings.sources.push({ name, path: resolved })
  saveSettings(settings)
  // Trigger rescan with thumbnail caching in background
  scanAndCache()
  res.json({ ok: true })
})

// API: browse directories for autocomplete suggestions.
// Query params:
//   path: a (possibly partial) absolute path the user has typed.
// Behaviour:
//   - If `path` is empty or '/', list root-level directories.
//   - If `path` is an existing directory (with or without trailing '/'),
//     list its immediate subdirectories.
//   - Otherwise, list the parent dir's subdirectories whose names start with
//     the typed basename (case-insensitive).
// Returns: { entries: [{ name, path }], parent: string }
app.get('/api/browse', (req, res) => {
  const input = typeof req.query.path === 'string' ? req.query.path : ''
  let parentDir, prefix
  try {
    if (!input) {
      parentDir = '/'
      prefix = ''
    } else if (input.endsWith('/')) {
      parentDir = path.resolve(input) || '/'
      prefix = ''
    } else {
      const candidate = path.resolve(input)
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        parentDir = candidate
        prefix = ''
      } else {
        parentDir = path.dirname(candidate)
        prefix = path.basename(candidate).toLowerCase()
      }
    }
    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
      return res.json({ entries: [], parent: parentDir })
    }
    const items = fs.readdirSync(parentDir, { withFileTypes: true })
    const entries = items
      .filter(d => {
        if (!d.isDirectory()) return false
        if (d.name.startsWith('.')) return false
        return prefix ? d.name.toLowerCase().startsWith(prefix) : true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50)
      .map(d => ({ name: d.name, path: path.join(parentDir, d.name) }))
    res.json({ entries, parent: parentDir })
  } catch {
    res.json({ entries: [], parent: '' })
  }
})

// API: remove a source (removes all albums from it)
app.delete('/api/sources/:name', (req, res) => {
  const settings = loadSettings()
  const source = settings.sources.find(s => s.name === req.params.name)
  if (!source) return res.status(404).json({ error: 'source not found' })
  const albumPrefix = `${req.params.name}/`
  settings.sources = settings.sources.filter(s => s.name !== req.params.name)
  settings.enabledAlbums = settings.enabledAlbums.filter(a => !a.startsWith(albumPrefix))
  saveSettings(settings)
  res.json({ ok: true })
})

function getAlbumsInSource(source, cacheThumbs) {
  try {
    const items = fs.readdirSync(source.path, { withFileTypes: true })
    return items
      .filter(d => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(d => {
        const albumPath = path.join(source.path, d.name)
        const coverFile = getCoverFile(albumPath)
        const fullAlbumName = `${source.name}/${d.name}`
        if (cacheThumbs && coverFile) {
          cacheThumbnail(fullAlbumName, coverFile, albumPath)
        }
        return {
          name: d.name,
          photoCount: getPhotoCount(albumPath),
          coverFile,
        }
      })
  } catch { return [] }
}

// API: list albums (from sources + manually added)
app.get('/api/albums', (req, res) => {
  const settings = loadSettings()
  const cached = loadManifestCache()
  const allAlbums = []

  // From cached manifest, filter to enabled albums
  if (cached) {
    cached.forEach(a => {
      if (settings.enabledAlbums.includes(a.name)) {
        allAlbums.push(a)
      }
    })
  }

  // Manually added albums (not from any source)
  const sourcePrefixes = new Set(settings.sources.map(s => `${s.name}/`))
  settings.enabledAlbums.forEach(a => {
    const slashIdx = a.indexOf('/')
    if (slashIdx !== -1 && !sourcePrefixes.has(a.substring(0, slashIdx + 1))) {
      allAlbums.push({
        name: a,
        photoCount: 0,
        coverFile: null,
      })
    }
  })

  res.json(allAlbums.sort((a, b) => a.name.localeCompare(b.name)))
})

// API: get all albums (including disabled, for settings) - serves from cache
app.get('/api/albums-manifest', (req, res) => {
  const cached = loadManifestCache()
  if (cached) {
    return res.json(cached)
  }
  // If no cache exists, do a live scan as fallback
  const settings = loadSettings()
  const allAlbums = []
  settings.sources.forEach(source => {
    getAlbumsInSource(source, false).forEach(a => {
      allAlbums.push({ name: `${source.name}/${a.name}`, photoCount: a.photoCount, coverFile: a.coverFile })
    })
  })
  res.json(allAlbums.sort((a, b) => a.name.localeCompare(b.name)))
})

// API: rescan all sources (regenerates manifest and thumbnail cache)
app.post('/api/scan', (req, res) => {
  try {
    ensureDir(THUMB_CACHE_DIR)
    // Clear old thumbnail cache
    const existing = fs.readdirSync(THUMB_CACHE_DIR)
    existing.forEach(f => {
      try { fs.unlinkSync(path.join(THUMB_CACHE_DIR, f)) } catch {}
    })
    scanAndCache()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// API: toggle a single album (manually added)
app.post('/api/albums', (req, res) => {
  const { name, path: albumPath } = req.body
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' })
  if (!albumPath || typeof albumPath !== 'string') return res.status(400).json({ error: 'path required' })
  const resolved = path.resolve(albumPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(400).json({ error: 'path does not exist or is not a directory' })
  }
  const settings = loadSettings()
  if (!settings.enabledAlbums.includes(name)) {
    settings.enabledAlbums.push(name)
  }
  saveSettings(settings)
  res.json({ ok: true })
})

app.delete('/api/albums/:source/:name', (req, res) => {
  const settings = loadSettings()
  const source = settings.sources.find(s => s.name === req.params.source)
  if (source) {
    const albumPath = path.join(source.path, req.params.name)
    if (fs.existsSync(albumPath)) {
      fs.rmSync(albumPath, { recursive: true, force: true })
    }
    const albumKey = `${req.params.source}/${req.params.name}`
    settings.enabledAlbums = settings.enabledAlbums.filter(a => a !== albumKey)
    saveSettings(settings)
    return res.json({ ok: true })
  }
  // Manually added album - remove from list only
  const albumKey = `${req.params.source}/${req.params.name}`
  settings.enabledAlbums = settings.enabledAlbums.filter(a => a !== albumKey)
  saveSettings(settings)
  res.json({ ok: true })
})

// API: get thumbnail of an image (use ?album= query param to avoid slash conflicts)
app.get('/api/albums/thumb', async (req, res) => {
  const album = req.query.album
  const filename = req.query.filename
  if (!album || !filename) return res.status(400).send('album and filename required')

  // Try cache first
  const cachedPath = getThumbnailCachePath(album, filename)
  if (cachedPath && fs.existsSync(cachedPath)) {
    try {
      res.set('Content-Type', 'image/jpeg')
      res.set('Cache-Control', 'public, max-age=86400')
      res.sendFile(cachedPath)
      return
    } catch {}
  }

  // Fallback: generate on the fly
  const filePath = resolveAlbumFilePath(album, filename)
  if (!filePath) return res.status(404).send('Not found')
  try {
    const thumbBuf = await sharp(filePath)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toBuffer()
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(thumbBuf)
  } catch {
    res.status(404).send('Not found')
  }
})

// API: get original image (use ?album= query param to avoid slash conflicts)
app.get('/api/albums/img', async (req, res) => {
  const album = req.query.album
  const filename = req.query.filename
  if (!album || !filename) return res.status(400).send('album and filename required')
  const filePath = resolveAlbumFilePath(album, filename)
  if (!filePath) return res.status(404).send('Not found')
  let realPath
  try {
    realPath = fs.realpathSync(filePath)
    if (!realPath.startsWith(ensureDir(path.dirname(filePath)))) {
      return res.status(403).send('Forbidden')
    }
  } catch {
    return res.status(404).send('Not found')
  }
  try {
    await res.sendFile(realPath)
  } catch {
    res.status(404).send('Not found')
  }
})

// API: list photos in an album
app.get('/api/albums/:album/photos', (req, res) => {
  const settings = loadSettings()
  const albumPath = resolveAlbumPath(req.params.album, settings)
  if (!albumPath) return res.json([])
  try {
    const files = fs.readdirSync(albumPath, { withFileTypes: true })
    const photos = files
      .filter(f => f.isFile() && IMAGE_EXTS.has(path.extname(f.name).toLowerCase()))
      .map(f => f.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    res.json(photos)
  } catch {
    res.json([])
  }
})

function resolveAlbumPath(album, settings) {
  const slashIdx = album.indexOf('/')
  if (slashIdx === -1) return null
  const sourceName = album.substring(0, slashIdx)
  const albumName = album.substring(slashIdx + 1)
  const source = settings.sources.find(s => s.name === sourceName)
  if (source) return path.join(source.path, albumName)
  // Try as a manually added album (source IS the album)
  if (fs.existsSync(album) && fs.statSync(album).isDirectory()) return album
  return null
}

function resolveAlbumFilePath(album, filename, settings) {
  if (!settings) settings = loadSettings()
  const slashIdx = album.indexOf('/')
  if (slashIdx === -1) return null
  const albumPath = resolveAlbumPath(album, settings)
  if (!albumPath) return null
  return path.join(albumPath, filename)
}

function loadManifestCache() {
  try {
    if (fs.existsSync(MANIFEST_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(MANIFEST_CACHE_FILE, 'utf8'))
    }
  } catch {}
  return null
}

function saveManifestCache(manifest) {
  try {
    ensureDir(CACHE_DIR)
    fs.writeFileSync(MANIFEST_CACHE_FILE, JSON.stringify(manifest, null, 2))
  } catch (e) {
    console.error('Failed to save manifest cache:', e.message)
  }
}

function scanAndCache(thumbCacheDir) {
  const settings = loadSettings()
  const allAlbums = []

  settings.sources.forEach(source => {
    const albums = getAlbumsInSource(source, true)
    albums.forEach(a => {
      allAlbums.push({ name: `${source.name}/${a.name}`, photoCount: a.photoCount, coverFile: a.coverFile })
    })
  })

  const manifest = allAlbums.sort((a, b) => a.name.localeCompare(b.name))
  saveManifestCache(manifest)
  console.log(`Rescan complete: ${manifest.length} albums cached`)
  return manifest
}

function getThumbCacheKey(albumName, filename) {
  return Buffer.from(`${albumName}||${filename}`).toString('base64url') + '.jpg'
}

function cacheThumbnail(albumName, filename, albumDir) {
  try {
    ensureDir(THUMB_CACHE_DIR)
    const cachePath = path.join(THUMB_CACHE_DIR, getThumbCacheKey(albumName, filename))
    if (fs.existsSync(cachePath)) return // already cached
    const filePath = path.join(albumDir, filename)
    sharp(filePath)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toFile(cachePath)
      .catch(() => {}) // ignore errors silently
  } catch {}
}

function getThumbnailCachePath(albumName, filename) {
  try {
    return path.join(THUMB_CACHE_DIR, getThumbCacheKey(albumName, filename))
  } catch { return null }
}

function getPhotoCount(dir) {
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true })
    return files.filter(f => f.isFile() && IMAGE_EXTS.has(path.extname(f.name).toLowerCase())).length
  } catch { return 0 }
}

function getCoverFile(dir) {
  try {
    const files = fs.readdirSync(dir)
    const imgFile = files.find(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    return imgFile || null
  } catch { return null }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  // Initial scan if no cache exists
  if (!loadManifestCache()) {
    console.log('No cache found — running initial scan...')
    scanAndCache()
  }
})

// Production: serve built frontend (must be after API routes)
const FRONTEND_DIST = path.resolve(process.env.FRONTEND_DIR || path.join(process.cwd(), 'dist'))
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST))
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
  })
}
