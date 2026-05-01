/* ═══════════════════════════════════════════════════
   MediaVault — vanilla JS, zero dependencies
   ═══════════════════════════════════════════════════ */

/* ── Constants ── */
const VIDEO_EXTS = new Set(['mp4','mov','mkv','avi','webm','m4v','wmv','flv','ts','m2ts'])
const AUDIO_EXTS = new Set(['mp3','flac','wav','aac','ogg','opus','m4a','wma','aiff'])
const THEMES = [
  { id:'dark',    label:'暗黑',  ac:'#7c6ff7', bg:'#0a0a0f' },
  { id:'light',   label:'明亮',  ac:'#5b52e8', bg:'#f0f0f7' },
  { id:'space',   label:'星空',  ac:'#f59e0b', bg:'#04060f' },
  { id:'warm',    label:'暖橙',  ac:'#f97316', bg:'#0c0804' },
  { id:'emerald', label:'翠绿',  ac:'#10b981', bg:'#030e07' },
  { id:'rose',    label:'玫瑰',  ac:'#f43f5e', bg:'#0e0408' },
]
const SPEEDS = [1, 1.5, 3, 4]
const FAVORITES_KEY = 'mv-favorites'
const HAS_FS_ACCESS = typeof window.showDirectoryPicker === 'function'
const PERF_MODE_KEY = 'mv-perf-mode'
const CPU_THREADS = navigator.hardwareConcurrency || 8
const META_PROGRESS_WEIGHT = 80
const THUMB_PROGRESS_WEIGHT = 20
const MEDIA_CACHE_PREFIX = 'media-cache:'
const MEDIA_CACHE_VERSION = 1
const VIRTUAL_BATCH_STD = 120
const VIRTUAL_BATCH_PERF = 80
const VIRTUAL_FIRST_STD = 180
const VIRTUAL_FIRST_PERF = 120

/* ── State ── */
const state = {
  items:       [],
  folders:     [],
  typeFilter:  'all',
  search:      '',
  speed:       3,
  theme:       localStorage.getItem('mv-theme') || 'dark',
  playerIdx:   -1,
  favorites:   new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')),
  perfMode:    localStorage.getItem(PERF_MODE_KEY) || 'standard',
  previewQueue: [],
}

/* ── DOM refs ── */
const $ = id => document.getElementById(id)
const grid        = $('grid')
const emptyState  = $('empty-state')
const statTxt     = $('stat-txt')
const searchInput = $('search-input')
const searchClear = $('search-clear')
const loadingBar  = $('loading-bar')
const folderChips = $('folder-chips')
const spdVal      = $('spd-val')
const spdPop      = $('spd-pop')
const themePop    = $('theme-pop')
const themeGrid   = $('theme-grid')
const btnConnect  = $('btn-connect')
const btnPerf     = $('btn-perf')
const audioPlayObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    e.target.classList.toggle('playing', e.isIntersecting)
  }
}, { threshold: 0.1 })
const loadMoreSentinel = document.createElement('div')
loadMoreSentinel.className = 'load-more-sentinel'
loadMoreSentinel.textContent = '继续加载...'
loadMoreSentinel.hidden = true
$('main').appendChild(loadMoreSentinel)

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */
const ext   = name => name.split('.').pop()?.toLowerCase() ?? ''
const isVid = name => VIDEO_EXTS.has(ext(name))
const isAud = name => AUDIO_EXTS.has(ext(name))
const isMed = name => isVid(name) || isAud(name)

function fmtDur(s) {
  if (!isFinite(s) || s <= 0) return '--:--'
  const h  = Math.floor(s / 3600)
  const m  = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  return h
    ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}
function fmtSize(b) {
  if (b < 1048576)    return `${(b / 1024).toFixed(0)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(2)} GB`
}
function aspect(w, h) {
  if (!w || !h) return 'r16x9'
  const r = w / h
  if (r >= 2.2)  return 'r21x9'
  if (r >= 1.55) return 'r16x9'
  if (r >= 1.1)  return 'r4x3'
  if (r >= 0.9)  return 'r1x1'
  if (r >= 0.6)  return 'r4x3'
  return 'r9x16'
}
const uuid = () => crypto.randomUUID()

function setProgress(p) {
  loadingBar.style.width   = p + '%'
  loadingBar.style.opacity = p >= 100 ? '0' : '1'
}

function idleYield() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function runWhenIdle(task) {
  return new Promise((resolve, reject) => {
    const run = () => Promise.resolve().then(task).then(resolve, reject)
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => run(), { timeout: 1200 })
    } else {
      setTimeout(run, 0)
    }
  })
}

function fileKey(file, rel) {
  return `${rel}|${file.size}|${file.lastModified}`
}

const mediaCacheKey = k => `${MEDIA_CACHE_PREFIX}${k}`

async function getMediaCache(k) {
  try { return await dbGet(mediaCacheKey(k)) } catch { return null }
}

async function setMediaCache(k, value) {
  try { await dbSet(mediaCacheKey(k), value) } catch {}
}

function getMetaWorkers() {
  return state.perfMode === 'performance'
    ? Math.min(4, Math.max(2, Math.floor(CPU_THREADS * 0.45)))
    : Math.min(6, Math.max(4, Math.floor(CPU_THREADS * 0.6)))
}

function getThumbWorkers() {
  return state.perfMode === 'performance'
    ? Math.min(3, Math.max(1, Math.floor(CPU_THREADS * 0.3)))
    : Math.min(4, Math.max(2, Math.floor(CPU_THREADS * 0.4)))
}

function getPreviewPoolLimit() {
  return state.perfMode === 'performance' ? 1 : 2
}

function getVirtualFirstCount() {
  return state.perfMode === 'performance' ? VIRTUAL_FIRST_PERF : VIRTUAL_FIRST_STD
}

function getVirtualBatchCount() {
  return state.perfMode === 'performance' ? VIRTUAL_BATCH_PERF : VIRTUAL_BATCH_STD
}

function applyPerfMode(mode) {
  state.perfMode = mode === 'performance' ? 'performance' : 'standard'
  localStorage.setItem(PERF_MODE_KEY, state.perfMode)
  document.body.classList.toggle('perf-mode', state.perfMode === 'performance')
  if (btnPerf) btnPerf.textContent = state.perfMode === 'performance' ? '性能：流畅优先' : '性能：标准'
}

function persistFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]))
}

function clearLibrary() {
  grid.querySelectorAll('.card[data-type="video"]').forEach(c => stopPreview(c))
  grid.querySelectorAll('.card[data-type="audio"]').forEach(c => audioPlayObserver.unobserve(c))
  for (const item of state.items) {
    if (item.url) URL.revokeObjectURL(item.url)
    if (item.thumb) URL.revokeObjectURL(item.thumb)
  }
  state.items = []
  state.folders = []
  state.playerIdx = -1
  state.previewQueue = []
  _virtualItems = []
  _virtualCursor = 0
  grid.innerHTML = ''
  renderFolderChips()
  updateStat()
  showGrid()
}

/* ═══════════════════════════════════════════════════
   FILE SYSTEM ACCESS PERSIST (IndexedDB)
   ═══════════════════════════════════════════════════ */
const DB_NAME = 'mediavault-db'
const DB_VER = 1
const KV_STORE = 'kv'
const LIB_HANDLE_KEY = 'library-handle'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbGet(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV_STORE, 'readonly')
    const store = tx.objectStore(KV_STORE)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbSet(key, val) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV_STORE, 'readwrite')
    const store = tx.objectStore(KV_STORE)
    const req = store.put(val, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function collectPairsFromHandle(dirHandle, base = '') {
  const pairs = []
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'directory') {
      const nested = await collectPairsFromHandle(entry, `${base}${name}/`)
      pairs.push(...nested)
      continue
    }
    if (!isMed(name)) continue
    const file = await entry.getFile()
    pairs.push({ file, rel: `${base}${name}` })
  }
  return pairs
}

async function loadFromDirectoryHandle(dirHandle, replace = false) {
  if (replace) clearLibrary()
  const pairs = await collectPairsFromHandle(dirHandle)
  await importPairs(pairs)
}

async function connectLibraryFolder() {
  if (!HAS_FS_ACCESS) return
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    await dbSet(LIB_HANDLE_KEY, handle)
    btnConnect.textContent = '目录已连接'
    btnConnect.classList.add('on')
    await loadFromDirectoryHandle(handle, true)
  } catch {}
}

async function tryRestoreLibraryFolder() {
  if (!HAS_FS_ACCESS) return
  try {
    const handle = await dbGet(LIB_HANDLE_KEY)
    if (!handle) return
    let perm = await handle.queryPermission({ mode: 'read' })
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' })
    if (perm !== 'granted') return
    btnConnect.textContent = '目录已连接'
    btnConnect.classList.add('on')
    await loadFromDirectoryHandle(handle, true)
  } catch {}
}

/* ═══════════════════════════════════════════════════
   PROBE METADATA
   ═══════════════════════════════════════════════════ */
function probeVideo(file) {
  return new Promise(resolve => {
    const vid = document.createElement('video')
    const url = URL.createObjectURL(file)
    let done  = false
    const finish = r => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      vid.src = ''
      resolve(r)
    }
    vid.preload = 'metadata'
    vid.muted   = true
    vid.onloadedmetadata = () => finish({ w: vid.videoWidth, h: vid.videoHeight, dur: vid.duration })
    vid.onerror          = () => finish(null)
    setTimeout(() => finish(null), 8000)
    vid.src = url
  })
}

function probeAudio(file) {
  return new Promise(resolve => {
    const aud = new Audio()
    const url = URL.createObjectURL(file)
    let done  = false
    const finish = d => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      aud.src = ''
      resolve(d)
    }
    aud.preload          = 'metadata'
    aud.onloadedmetadata = () => finish(aud.duration)
    aud.onerror          = () => finish(null)
    setTimeout(() => finish(null), 6000)
    aud.src = url
  })
}

/* ═══════════════════════════════════════════════════
   THUMBNAIL — canvas → blob → objectURL
   ═══════════════════════════════════════════════════ */
function captureThumbnail(file) {
  return new Promise(resolve => {
    const vid = document.createElement('video')
    const url = URL.createObjectURL(file)
    let done  = false
    const finish = r => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      vid.src = ''
      resolve(r)
    }
    vid.preload          = 'metadata'
    vid.muted            = true
    vid.onloadedmetadata = () => { vid.currentTime = Math.min(vid.duration * 0.1, 3) }
    vid.onseeked         = () => {
      try {
        const W = Math.min(vid.videoWidth, 480)
        const H = Math.round(W * vid.videoHeight / vid.videoWidth)
        const c = document.createElement('canvas')
        c.width = W; c.height = H
        c.getContext('2d').drawImage(vid, 0, 0, W, H)
        c.toBlob(blob => {
          if (!blob) return finish(null)
          finish({ blob, url: URL.createObjectURL(blob) })
        }, 'image/jpeg', 0.72)
      } catch { finish(null) }
    }
    vid.onerror = () => finish(null)
    setTimeout(() => finish(null), 12000)
    vid.src = url
  })
}

/* ═══════════════════════════════════════════════════
   FOLDER TREE
   ═══════════════════════════════════════════════════ */
function buildFolders(pairs) {
  const map        = new Map()
  const fileFolder = new Map()

  for (const { file, rel } of pairs) {
    const parts = rel.split('/').filter(Boolean).slice(0, -1)
    if (!parts.length) { fileFolder.set(file, '__root__'); continue }

    let parentId = null
    for (let i = 0; i < parts.length; i++) {
      const id = parts.slice(0, i + 1).join('/')
      if (!map.has(id)) {
        const existing = state.folders.find(f => f.id === id)
        map.set(id, { id, name: parts[i], visible: existing?.visible ?? true })
      }
      parentId = id
    }
    fileFolder.set(file, parentId)
  }
  return { folders: [...map.values()], fileFolder }
}

async function readEntry(entry, base) {
  if (entry.isFile) {
    return new Promise(res => {
      entry.file(
        f => res(isMed(f.name) ? [{ file: f, rel: base + f.name }] : []),
        () => res([])
      )
    })
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    const all    = []
    const read   = () => new Promise((res, rej) => reader.readEntries(res, rej))
    let batch
    do { batch = await read(); all.push(...batch) } while (batch.length)
    const nested = await Promise.all(all.map(e => readEntry(e, `${base}${entry.name}/`)))
    return nested.flat()
  }
  return []
}

/* ═══════════════════════════════════════════════════
   IMPORT — adaptive concurrency, streaming to grid
   ═══════════════════════════════════════════════════ */
async function importPairs(pairs) {
  if (!pairs.length) return
  const total = pairs.length
  let done = 0
  const newVideoItems = []
  setProgress(1)

  const { folders, fileFolder } = buildFolders(pairs)
  for (const f of folders) {
    if (!state.folders.find(x => x.id === f.id)) state.folders.push(f)
  }
  renderFolderChips()

  // Phase 1: probe metadata (adaptive concurrent)
  const queue = [...pairs]
  const workers = Array.from({ length: getMetaWorkers() }, async () => {
    while (queue.length) {
      const { file, rel } = queue.shift()
      const id     = uuid()
      const url    = URL.createObjectURL(file)
      const type   = isVid(file.name) ? 'video' : 'audio'
      const folder = fileFolder.get(file) ?? '__root__'
      const k      = fileKey(file, rel)
      const cached = await getMediaCache(k)

      let w = null, h = null, dur = null
      let asp = type === 'audio' ? 'r1x1' : 'r16x9'
      let thumb = null

      if (cached && cached.v === MEDIA_CACHE_VERSION) {
        w = cached.w ?? null
        h = cached.h ?? null
        dur = cached.dur ?? null
        asp = cached.asp ?? asp
        if (cached.thumbBlob) thumb = URL.createObjectURL(cached.thumbBlob)
      } else if (type === 'video') {
        const m = await probeVideo(file)
        if (m) { w = m.w; h = m.h; dur = m.dur; asp = aspect(w, h) }
      } else {
        dur = await probeAudio(file)
      }

      const item = {
        id, name: file.name, type, file, url,
        thumb, dur, w, h, asp,
        size: file.size, folder, addedAt: Date.now(),
        k, rel,
        favorite: false,
      }
      item.favorite = state.favorites.has(item.k)
      state.items.push(item)
      if (type === 'video') newVideoItems.push(item)
      if (!cached) {
        setMediaCache(k, {
          v: MEDIA_CACHE_VERSION,
          w, h, dur, asp,
          thumbBlob: null,
        })
      }

      done++
      setProgress(Math.round(done / total * META_PROGRESS_WEIGHT))
      if (done % 8 === 0 || done === total) updateStat()
      if (done % 12 === 0) await idleYield()
    }
  })
  await Promise.all(workers)
  rebuildGrid()

  // Phase 2: thumbnails (adaptive concurrent), only for current import batch
  const vidItems   = newVideoItems.filter(x => !x.thumb)
  if (!vidItems.length) {
    setProgress(100)
    setTimeout(() => setProgress(0), 500)
    return
  }
  const thumbQ     = [...vidItems]
  const thumbDone  = { n: 0 }
  const thumbWork  = Array.from({ length: getThumbWorkers() }, async () => {
    while (thumbQ.length) {
      const item = thumbQ.shift()
      const t    = await runWhenIdle(() => captureThumbnail(item.file))
      if (t) {
        item.thumb = t.url
        await setMediaCache(item.k, {
          v: MEDIA_CACHE_VERSION,
          w: item.w, h: item.h, dur: item.dur, asp: item.asp,
          thumbBlob: t.blob,
        })
        const img  = document.querySelector(`[data-id="${item.id}"] .thumb-img`)
        if (img) {
          img.src    = t.url
          img.hidden = false
          const ph   = img.closest('.thumb')?.querySelector('.thumb-placeholder')
          if (ph) ph.remove()
        }
      }
      thumbDone.n++
      setProgress(
        META_PROGRESS_WEIGHT +
        Math.round(thumbDone.n / vidItems.length * THUMB_PROGRESS_WEIGHT)
      )
      if (thumbDone.n % 8 === 0) await idleYield()
    }
  })
  await Promise.all(thumbWork)

  // 缩略图失败的卡片改为静态占位，避免 shimmer 持续动画拖慢滚动
  for (const item of vidItems) {
    if (item.thumb) continue
    const ph = document.querySelector(`[data-id="${item.id}"] .thumb-placeholder`)
    if (ph) ph.classList.add('idle')
  }

  setProgress(100)
  setTimeout(() => setProgress(0), 500)
}

/* ═══════════════════════════════════════════════════
   CARD — thumbnail-first, hover preview
   ═══════════════════════════════════════════════════ */
function startPreview(card, item) {
  if (card._vid) return
  acquirePreviewSlot(card)

  const vid        = document.createElement('video')
  vid.className    = 'thumb-video'
  vid.muted        = true
  vid.loop         = true
  vid.playsInline  = true
  vid.preload      = 'auto'
  vid.playbackRate = state.speed
  card._vid        = vid

  // 等首帧就绪后淡入并播放，避免 play() 在未加载时被浏览器拒绝
  vid.addEventListener('canplay', () => {
    vid.playbackRate = state.speed
    vid.play().catch(() => {})
    requestAnimationFrame(() => vid.classList.add('visible'))
    card.classList.add('playing')

    const spd = card.querySelector('.spd-b')
    if (spd) { spd.textContent = state.speed + '×'; spd.style.opacity = '1' }

    // 进度条：直接用 JS 驱动宽度，避免 CSS animation 反复 restart
    startProgBar(card, vid)
  }, { once: true })

  card.querySelector('.thumb').prepend(vid)
  vid.src = item.url
}

function stopPreview(card) {
  const vid = card._vid
  releasePreviewSlot(card)
  if (!vid) return
  card.classList.remove('playing')
  cancelAnimationFrame(card._raf)
  card._raf = null
  vid.pause()
  vid.src = ''
  vid.remove()
  card._vid = null

  const spd = card.querySelector('.spd-b')
  if (spd) spd.style.opacity = '0'

  // 重置进度条宽度
  const fill = card.querySelector('.prog-fill')
  if (fill) fill.style.width = '0'
}

function acquirePreviewSlot(card) {
  const q = state.previewQueue
  const idx = q.indexOf(card)
  if (idx >= 0) q.splice(idx, 1)
  q.push(card)
  while (q.length > getPreviewPoolLimit()) {
    const victim = q.shift()
    if (victim && victim !== card) stopPreview(victim)
  }
}

function releasePreviewSlot(card) {
  const idx = state.previewQueue.indexOf(card)
  if (idx >= 0) state.previewQueue.splice(idx, 1)
}

function startProgBar(card, vid) {
  cancelAnimationFrame(card._raf)

  function tick() {
    if (!card._vid || vid !== card._vid) return
    const fill = card.querySelector('.prog-fill')
    if (fill && vid.duration) {
      fill.style.width = (vid.currentTime / vid.duration * 100) + '%'
    }
    card._raf = requestAnimationFrame(tick)
  }
  card._raf = requestAnimationFrame(tick)
}

let _cardIdx = 0
let _virtualItems = []
let _virtualCursor = 0

const virtualObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue
    renderNextBatch()
  }
}, { rootMargin: '1200px 0px' })
virtualObserver.observe(loadMoreSentinel)

function renderNextBatch() {
  if (_virtualCursor >= _virtualItems.length) {
    updateLoadMoreSentinel()
    return
  }
  const next = Math.min(_virtualCursor + getVirtualBatchCount(), _virtualItems.length)
  const frag = document.createDocumentFragment()
  for (let i = _virtualCursor; i < next; i++) {
    frag.appendChild(makeCard(_virtualItems[i]))
  }
  grid.appendChild(frag)
  _virtualCursor = next
  updateLoadMoreSentinel()
}

function updateLoadMoreSentinel() {
  const hide = grid.hidden || _virtualCursor >= _virtualItems.length
  loadMoreSentinel.hidden = hide
  if (hide) return
  loadMoreSentinel.textContent = `继续加载 ${_virtualCursor}/${_virtualItems.length}`
}

function resetVirtualRender(items) {
  _virtualItems = items
  _virtualCursor = 0
  _cardIdx = 0
  grid.innerHTML = ''
  const first = Math.min(getVirtualFirstCount(), _virtualItems.length)
  if (first > 0) {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < first; i++) {
      frag.appendChild(makeCard(_virtualItems[i]))
    }
    grid.appendChild(frag)
    _virtualCursor = first
  }
  updateLoadMoreSentinel()
}

function makeCard(item) {
  const card         = document.createElement('div')
  card.className     = 'card'
  card.dataset.id    = item.id
  card.dataset.folder= item.folder
  card.dataset.type  = item.type
  card._vid          = null
  card.classList.toggle('fav', !!item.favorite)

  // Staggered entrance — reset after 500ms so re-renders don't accumulate delay
  const delay = Math.min(_cardIdx % 30, 20) * 30
  card.style.animationDelay = delay + 'ms'
  _cardIdx++

  if (item.type === 'video') {
    const hasDur   = !!item.dur
    const hasDims  = !!item.w
    const thumbSrc = item.thumb ? ` src="${item.thumb}"` : ''
    const placeholder = item.thumb ? '' : '<div class="thumb-placeholder"></div>'

    card.innerHTML = `
      <div class="thumb ${item.asp}">
        ${placeholder}
        <img class="thumb-img"${thumbSrc}${!item.thumb ? ' hidden' : ''} alt="" decoding="async" />
        <div class="thumb-ov"><div class="play-ring"></div></div>
        <span class="badge bv">视频</span>
        <button class="fav-btn${item.favorite ? ' on' : ''}" title="收藏">${item.favorite ? '❤' : '♡'}</button>
        ${hasDur ? `<span class="dur-b">${fmtDur(item.dur)}</span>` : ''}
        <span class="spd-b">${state.speed}×</span>
        <div class="prog-bar"><div class="prog-fill"></div></div>
      </div>
      <div class="info">
        <div class="info-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
        <div class="info-meta">
          <span>${fmtSize(item.size)}</span>
          ${hasDur  ? `<span class="dot">·</span><span>${fmtDur(item.dur)}</span>` : ''}
          ${hasDims ? `<span class="dot">·</span><span>${item.w}×${item.h}</span>` : ''}
        </div>
      </div>`

    card.addEventListener('mouseenter', () => startPreview(card, item))
    card.addEventListener('mouseleave', () => stopPreview(card))
    const favBtn = card.querySelector('.fav-btn')
    if (favBtn) {
      favBtn.addEventListener('click', e => {
        e.stopPropagation()
        toggleFavorite(item, card, favBtn)
      })
    }

  } else {
    // Audio card
    const delays = [0, .15, .3, .45, .6, .75, .6, .45, .3, .15, 0]
    card.innerHTML = `
      <div class="thumb r1x1">
        <div class="audio-bg">
          <span class="mus-note">♫</span>
          <div class="waves">${delays.map((d, i) => `<div class="wbar" style="animation-delay:${d}s;height:${18 + Math.sin(i) * 8}px"></div>`).join('')}</div>
        </div>
        <div class="play-dot"></div>
        <span class="badge ba">音频</span>
        <button class="fav-btn${item.favorite ? ' on' : ''}" title="收藏">${item.favorite ? '❤' : '♡'}</button>
        ${item.dur ? `<span class="dur-b">${fmtDur(item.dur)}</span>` : ''}
      </div>
      <div class="info">
        <div class="info-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
        <div class="info-meta">
          <span>${fmtSize(item.size)}</span>
          ${item.dur ? `<span class="dot">·</span><span>${fmtDur(item.dur)}</span>` : ''}
        </div>
      </div>`

    // Audio wave animation driven by shared observer (lower scroll overhead)
    audioPlayObserver.observe(card)
    const favBtn = card.querySelector('.fav-btn')
    if (favBtn) {
      favBtn.addEventListener('click', e => {
        e.stopPropagation()
        toggleFavorite(item, card, favBtn)
      })
    }
  }

  card.addEventListener('click', () => openPlayer(item, card))
  return card
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function toggleFavorite(item, card, btn) {
  item.favorite = !item.favorite
  if (item.favorite) state.favorites.add(item.k)
  else state.favorites.delete(item.k)
  persistFavorites()

  if (btn) {
    btn.classList.toggle('on', item.favorite)
    btn.textContent = item.favorite ? '❤' : '♡'
  }
  if (card) card.classList.toggle('fav', item.favorite)

  if (state.typeFilter === 'favorite' && !item.favorite) {
    rebuildGrid()
    return
  }

  if (!card || !btn) {
    const host = grid.querySelector(`.card[data-id="${item.id}"]`)
    if (host) {
      host.classList.toggle('fav', item.favorite)
      const hostBtn = host.querySelector('.fav-btn')
      if (hostBtn) {
        hostBtn.classList.toggle('on', item.favorite)
        hostBtn.textContent = item.favorite ? '❤' : '♡'
      }
    }
  }
  updateStat()
}

/* ═══════════════════════════════════════════════════
   FILTERING & RENDERING
   ═══════════════════════════════════════════════════ */
function isItemVisible(item) {
  const q = state.search.trim().toLowerCase()
  if (q && !item.name.toLowerCase().includes(q)) return false
  if (state.typeFilter === 'video'  && item.type !== 'video')  return false
  if (state.typeFilter === 'audio'  && item.type !== 'audio')  return false
  if (state.typeFilter === 'recent' && Date.now() - item.addedAt > 86400000) return false
  if (state.typeFilter === 'favorite' && !item.favorite) return false
  const folder = state.folders.find(f => f.id === item.folder)
  if (folder && !folder.visible) return false
  return true
}

function rebuildGrid() {
  grid.querySelectorAll('.card[data-type="video"]').forEach(c => stopPreview(c))
  grid.querySelectorAll('.card[data-type="audio"]').forEach(c => audioPlayObserver.unobserve(c))
  state.previewQueue = []

  const visible = state.items.filter(isItemVisible)
  resetVirtualRender(visible)

  showGrid()
  updateStat()
}

function showGrid() {
  const hasItems    = state.items.length > 0
  emptyState.hidden = hasItems
  grid.hidden       = !hasItems
  updateLoadMoreSentinel()
}

function updateStat() {
  const vis  = state.items.filter(isItemVisible)
  const vids = vis.filter(x => x.type === 'video').length
  const auds = vis.filter(x => x.type === 'audio').length
  const favs = vis.filter(x => x.favorite).length
  statTxt.innerHTML =
    `<b>${vis.length}</b> 个文件 &nbsp;·&nbsp; <b>${vids}</b> 视频 &nbsp;·&nbsp; <b>${auds}</b> 音频 &nbsp;·&nbsp; <b>${favs}</b> 收藏`
}

function renderFolderChips() {
  folderChips.innerHTML = ''
  for (const f of state.folders) {
    const chip       = document.createElement('button')
    chip.className   = 'chip' + (f.visible ? ' on' : '')
    chip.textContent = f.name.split('/').pop()
    chip.onclick     = () => {
      f.visible = !f.visible
      chip.classList.toggle('on', f.visible)
      rebuildGrid()
    }
    folderChips.appendChild(chip)
  }
}

function applySpeed(s) {
  state.speed = s
  spdVal.textContent = s + '×'

  document.querySelectorAll('.spd-opt').forEach(el => {
    el.classList.toggle('on', +el.dataset.spd === s)
  })
  grid.querySelectorAll('.card[data-type="video"]').forEach(card => {
    const spd = card.querySelector('.spd-b')
    if (spd) spd.textContent = s + '×'
    if (card._vid) card._vid.playbackRate = s
  })
}

/* ═══════════════════════════════════════════════════
   FULLSCREEN PLAYER
   ═══════════════════════════════════════════════════ */
const playerEl  = $('player')
const playerVid = $('player-video')
const playerOvl = $('player-overlay')
const pmTitle   = $('pm-title')
const pmIdx     = $('pm-idx')
const pmProg    = $('pm-prog')
const pmThumb   = $('pm-thumb')
const pmTrack   = $('pm-track')
const pmCur     = $('pm-cur')
const pmDur     = $('pm-dur')
const pmPlayIco = $('pm-play-ico')
const pmSpinner = $('pm-spinner')
const pmVf      = $('pm-vf')
const pmMute    = $('pm-mute')
const pmVolIco  = $('pm-vol-ico')

let hideTimer  = null
let dragActive = false
let _muted     = false
let _volume    = 1

const PLAY_ICO  = `<polygon points="5 3 19 12 5 21 5 3"/>`
const PAUSE_ICO = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`
const VOL_ON    = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`
const VOL_OFF   = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor"/>`

function openPlayer(item, triggerEl) {
  state.playerIdx = state.items.indexOf(item)

  // 从点击的卡片位置展开到全屏
  if (triggerEl) {
    const r = triggerEl.getBoundingClientRect()
    playerEl.style.setProperty('--px', r.left + 'px')
    playerEl.style.setProperty('--py', r.top  + 'px')
    playerEl.style.setProperty('--pw', r.width  + 'px')
    playerEl.style.setProperty('--ph', r.height + 'px')
    playerEl.classList.remove('leaving')
    playerEl.classList.add('entering')
    playerEl.addEventListener('animationend', () => playerEl.classList.remove('entering'), { once: true })
  }

  playerEl.hidden              = false
  document.body.style.overflow = 'hidden'
  loadPlayerItem(item)
}

function closePlayer() {
  playerVid.pause()
  playerEl.classList.remove('entering')
  playerEl.classList.add('leaving')
  playerEl.addEventListener('animationend', () => {
    playerVid.src              = ''
    playerEl.hidden             = true
    playerEl.classList.remove('leaving')
    document.body.style.overflow = ''
  }, { once: true })
  clearTimeout(hideTimer)
}

function loadPlayerItem(item) {
  pmTitle.textContent = `${item.favorite ? '❤ ' : ''}${item.name}`
  pmSpinner.hidden    = false
  updatePlayerIdx()
  showOverlay()

  // 重置静音状态
  _muted             = false
  playerVid.muted    = false
  playerVid.volume   = _volume
  pmVolIco.innerHTML = VOL_ON
  pmVf.style.width   = _volume * 100 + '%'

  playerVid.src = item.url
  playerVid.load()

  // 等 loadedmetadata 后再 play，确保在用户手势的同步调用链之外也能播放
  playerVid.addEventListener('loadedmetadata', () => {
    playerVid.play().catch(() => {
      // 浏览器仍然拒绝时静音重试
      playerVid.muted    = true
      _muted             = true
      pmVolIco.innerHTML = VOL_OFF
      pmVf.style.width   = '0%'
      playerVid.play().catch(() => {})
    })
  }, { once: true })
}

function showOverlay() {
  playerOvl.classList.add('show')
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => playerOvl.classList.remove('show'), 3000)
}

function updatePlayerIdx() {
  const visible = state.items.filter(isItemVisible)
  const cur     = visible.findIndex(x => x === state.items[state.playerIdx])
  if (cur >= 0) pmIdx.textContent = `${cur + 1} / ${visible.length}`
}

// Time / progress
playerVid.addEventListener('timeupdate', () => {
  if (dragActive || !playerVid.duration) return
  const pct = playerVid.currentTime / playerVid.duration * 100
  pmProg.style.width  = pct + '%'
  pmThumb.style.left  = pct + '%'
  pmCur.textContent   = fmtDur(playerVid.currentTime)
})
playerVid.addEventListener('loadedmetadata', () => {
  pmDur.textContent = fmtDur(playerVid.duration)
})
playerVid.addEventListener('waiting', () => { pmSpinner.hidden = false })
playerVid.addEventListener('playing', () => {
  pmSpinner.hidden       = true
  pmPlayIco.innerHTML    = PAUSE_ICO
})
playerVid.addEventListener('pause', () => { pmPlayIco.innerHTML = PLAY_ICO })
playerVid.addEventListener('ended', () => navigatePlayer(1))

// Progress bar drag
function seekTo(e) {
  const rect = pmTrack.getBoundingClientRect()
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerVid.currentTime = pct * playerVid.duration
  pmProg.style.width    = pct * 100 + '%'
  pmThumb.style.left    = pct * 100 + '%'
}
pmTrack.addEventListener('mousedown', e => {
  dragActive = true
  pmTrack.classList.add('dragging')
  seekTo(e)
  const onMove = ev => seekTo(ev)
  const onUp   = () => {
    dragActive = false
    pmTrack.classList.remove('dragging')
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
})

// Volume bar (click + drag)
function setVol(e) {
  const rect = $('pm-vt').getBoundingClientRect()
  const vol  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  _volume          = vol
  playerVid.volume = vol
  playerVid.muted  = vol === 0
  pmVf.style.width = vol * 100 + '%'
  _muted             = vol === 0
  pmVolIco.innerHTML = _muted ? VOL_OFF : VOL_ON
}
$('pm-vt').addEventListener('mousedown', e => {
  setVol(e)
  const onMove = ev => setVol(ev)
  const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
})

// Mute toggle
pmMute.addEventListener('click', () => {
  _muted = !_muted
  playerVid.muted      = _muted
  pmVolIco.innerHTML   = _muted ? VOL_OFF : VOL_ON
  pmVf.style.width     = _muted ? '0%' : (playerVid.volume * 100) + '%'
})

function navigatePlayer(dir) {
  const visible = state.items.filter(isItemVisible)
  const cur     = visible.findIndex(x => x === state.items[state.playerIdx])
  const next    = visible[(cur + dir + visible.length) % visible.length]
  if (next) { state.playerIdx = state.items.indexOf(next); loadPlayerItem(next) }
}

$('pm-close').onclick = closePlayer
$('pm-play').onclick  = () => playerVid.paused ? playerVid.play() : playerVid.pause()
$('pm-prev').onclick  = () => navigatePlayer(-1)
$('pm-next').onclick  = () => navigatePlayer(1)

playerEl.addEventListener('mousemove', showOverlay)
playerEl.addEventListener('click', e => {
  if (e.target === playerEl || e.target === playerVid) {
    playerVid.paused ? playerVid.play() : playerVid.pause()
    showOverlay()
  }
})

document.addEventListener('keydown', e => {
  if (playerEl.hidden) return
  if      (e.key === 'Escape')      closePlayer()
  else if (e.key === 'Enter' || e.key === 'f' || e.key === 'F') {
    const cur = state.items[state.playerIdx]
    if (cur) {
      toggleFavorite(cur)
      pmTitle.textContent = `${cur.favorite ? '❤ ' : ''}${cur.name}`
    }
  }
  else if (e.key === ' ')           { e.preventDefault(); playerVid.paused ? playerVid.play() : playerVid.pause() }
  else if (e.key === 'ArrowRight')  playerVid.currentTime = Math.min(playerVid.duration, playerVid.currentTime + 5)
  else if (e.key === 'ArrowLeft')   playerVid.currentTime = Math.max(0, playerVid.currentTime - 5)
  else if (e.key === 'ArrowUp')     { playerVid.volume = Math.min(1, playerVid.volume + 0.1); pmVf.style.width = playerVid.volume * 100 + '%' }
  else if (e.key === 'ArrowDown')   { playerVid.volume = Math.max(0, playerVid.volume - 0.1); pmVf.style.width = playerVid.volume * 100 + '%' }
  else if (e.key === 'n' || e.key === 'N') navigatePlayer(1)
  else if (e.key === 'p' || e.key === 'P') navigatePlayer(-1)
  else if (e.key === 'm' || e.key === 'M') pmMute.click()
})

/* ═══════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════ */
function applyTheme(id) {
  state.theme = id
  document.documentElement.dataset.theme = id
  localStorage.setItem('mv-theme', id)
  themeGrid.querySelectorAll('.theme-item').forEach(el => {
    const on = el.dataset.t === id
    el.classList.toggle('on', on)
    const chk = el.querySelector('.theme-check')
    if (chk) chk.hidden = !on
  })
}

themeGrid.innerHTML = THEMES.map(t => `
  <div class="theme-item${t.id === state.theme ? ' on' : ''}" data-t="${t.id}">
    <div class="theme-preview" style="background:${t.bg}">
      <div class="theme-dot" style="background:${t.ac}"></div>
    </div>
    <span class="theme-label">${t.label}</span>
    <span class="theme-check"${t.id !== state.theme ? ' hidden' : ''}>✓</span>
  </div>`).join('')

themeGrid.addEventListener('click', e => {
  const item = e.target.closest('.theme-item')
  if (item) { applyTheme(item.dataset.t); themePop.classList.remove('open') }
})
applyTheme(state.theme)

$('theme-btn').onclick = e => {
  e.stopPropagation()
  themePop.classList.toggle('open')
  spdPop.classList.remove('open')
}
document.addEventListener('click', e => {
  if (!$('theme-wrap').contains(e.target)) themePop.classList.remove('open')
  if (!$('spd-wrap').contains(e.target))   spdPop.classList.remove('open')
})

/* ── Speed ── */
$('spd-btn').onclick = e => {
  e.stopPropagation()
  spdPop.classList.toggle('open')
  themePop.classList.remove('open')
}
spdPop.addEventListener('click', e => {
  const opt = e.target.closest('.spd-opt')
  if (opt) { applySpeed(+opt.dataset.spd); spdPop.classList.remove('open') }
})

/* ── Type filter chips ── */
$('type-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip')
  if (!chip) return
  document.querySelectorAll('#type-chips .chip').forEach(c => c.classList.remove('on'))
  chip.classList.add('on')
  state.typeFilter = chip.dataset.filter
  rebuildGrid()
})

/* ── Search ── */
let searchTimer = null
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    state.search = searchInput.value
    searchClear.classList.toggle('show', !!searchInput.value)
    rebuildGrid()
  }, 180)
})
searchClear.onclick = () => {
  searchInput.value  = ''
  state.search       = ''
  searchClear.classList.remove('show')
  rebuildGrid()
}

/* ═══════════════════════════════════════════════════
   FILE IMPORT
   ═══════════════════════════════════════════════════ */
function filesToPairs(fileList) {
  return Array.from(fileList)
    .filter(f => isMed(f.name))
    .map(f => ({ file: f, rel: f.webkitRelativePath || f.name }))
}

async function handleDrop(dt) {
  const pairs = []
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry()
    if (entry) pairs.push(...await readEntry(entry, ''))
  }
  importPairs(pairs)
}

let dropDepth = 0
const dropOv  = $('drop-ov')
document.addEventListener('dragenter', e => {
  e.preventDefault()
  dropDepth++
  dropOv.classList.add('active')
})
document.addEventListener('dragleave', () => {
  if (--dropDepth <= 0) { dropDepth = 0; dropOv.classList.remove('active') }
})
document.addEventListener('dragover',  e => e.preventDefault())
document.addEventListener('drop', e => {
  e.preventDefault()
  dropDepth = 0
  dropOv.classList.remove('active')
  handleDrop(e.dataTransfer)
})

$('input-files').addEventListener('change', function() {
  if (this.files?.length) importPairs(filesToPairs(this.files))
  this.value = ''
})
$('input-folder').addEventListener('change', function() {
  if (this.files?.length) importPairs(filesToPairs(this.files))
  this.value = ''
})

if (btnConnect) {
  if (!HAS_FS_ACCESS) {
    btnConnect.disabled = true
    btnConnect.title = '当前浏览器不支持目录持久化授权'
  } else {
    btnConnect.addEventListener('click', connectLibraryFolder)
    tryRestoreLibraryFolder()
  }
}

if (btnPerf) {
  btnPerf.addEventListener('click', () => {
    const next = state.perfMode === 'performance' ? 'standard' : 'performance'
    applyPerfMode(next)
    rebuildGrid()
  })
}
applyPerfMode(state.perfMode)
