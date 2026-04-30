/* ═══════════════════════════════════════════════════
   MediaVault — vanilla JS, zero dependencies
   ═══════════════════════════════════════════════════ */

/* ── Constants ── */
const VIDEO_EXTS = new Set(['mp4','mov','mkv','avi','webm','m4v','wmv','flv','ts','m2ts'])
const AUDIO_EXTS = new Set(['mp3','flac','wav','aac','ogg','opus','m4a','wma','aiff'])
const THEMES = [
  { id:'dark',    label:'Dark',    ac:'#6366f1', bg:'#090909' },
  { id:'light',   label:'Light',   ac:'#5856d6', bg:'#f2f2f7' },
  { id:'space',   label:'Space',   ac:'#f59e0b', bg:'#060818' },
  { id:'warm',    label:'Warm',    ac:'#f97316', bg:'#0d0804' },
  { id:'emerald', label:'Emerald', ac:'#10b981', bg:'#050e08' },
  { id:'rose',    label:'Rose',    ac:'#f43f5e', bg:'#0f0508' },
]
const SPEEDS = [1, 1.5, 3, 4]
const SEEK_SECS = { 1:20, 1.5:13, 2:10, 3:6.5, 4:5 }

/* ── State ── */
const state = {
  items:       [],    // MediaItem[]
  folders:     [],    // { id, name, visible }[]
  typeFilter:  'all',
  search:      '',
  speed:       3,
  theme:       localStorage.getItem('mv-theme') || 'dark',
  playerIdx:   -1,
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

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */
function ext(name) { return name.split('.').pop()?.toLowerCase() ?? '' }
function isVideo(name) { return VIDEO_EXTS.has(ext(name)) }
function isAudio(name) { return AUDIO_EXTS.has(ext(name)) }
function isMedia(name) { return isVideo(name) || isAudio(name) }

function fmtDur(s) {
  if (!isFinite(s) || s <= 0) return '--:--'
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = Math.floor(s%60)
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
           : `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}
function fmtSize(b) {
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`
  if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`
  return `${(b/1073741824).toFixed(2)} GB`
}
function aspect(w, h) {
  if (!w || !h) return 'r16x9'
  const r = w/h
  if (r >= 2.2) return 'r21x9'
  if (r >= 1.55) return 'r16x9'
  if (r >= 1.1) return 'r4x3'
  if (r >= 0.9) return 'r1x1'
  if (r >= 0.6) return 'r4x3'
  return 'r9x16'
}
function uuid() { return crypto.randomUUID() }
function setProgress(p) {
  loadingBar.style.width = p + '%'
  loadingBar.style.opacity = p >= 100 ? '0' : '1'
}

/* ═══════════════════════════════════════════════════
   PROBE METADATA  (pure DOM, no libs)
   ═══════════════════════════════════════════════════ */
function probeVideo(file) {
  return new Promise(resolve => {
    const vid = document.createElement('video')
    const url = URL.createObjectURL(file)
    let done = false
    const finish = r => { if (done) return; done = true; URL.revokeObjectURL(url); vid.src = ''; resolve(r) }
    vid.preload = 'metadata'; vid.muted = true
    vid.onloadedmetadata = () => finish({ w: vid.videoWidth, h: vid.videoHeight, dur: vid.duration })
    vid.onerror = () => finish(null)
    setTimeout(() => finish(null), 8000)
    vid.src = url
  })
}
function probeAudio(file) {
  return new Promise(resolve => {
    const aud = new Audio()
    const url = URL.createObjectURL(file)
    let done = false
    const finish = d => { if (done) return; done = true; URL.revokeObjectURL(url); aud.src = ''; resolve(d) }
    aud.preload = 'metadata'
    aud.onloadedmetadata = () => finish(aud.duration)
    aud.onerror = () => finish(null)
    setTimeout(() => finish(null), 6000)
    aud.src = url
  })
}

/* ═══════════════════════════════════════════════════
   THUMBNAIL  — canvas → blob → objectURL
   ═══════════════════════════════════════════════════ */
function captureThumbnail(file) {
  return new Promise(resolve => {
    const vid = document.createElement('video')
    const url = URL.createObjectURL(file)
    let done = false
    const finish = r => { if (done) return; done = true; URL.revokeObjectURL(url); vid.src = ''; resolve(r) }

    vid.preload = 'metadata'; vid.muted = true
    vid.onloadedmetadata = () => { vid.currentTime = Math.min(vid.duration * 0.1, 3) }
    vid.onseeked = () => {
      try {
        const W = Math.min(vid.videoWidth, 480)
        const H = Math.round(W * vid.videoHeight / vid.videoWidth)
        const c = document.createElement('canvas')
        c.width = W; c.height = H
        c.getContext('2d').drawImage(vid, 0, 0, W, H)
        c.toBlob(blob => finish(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.72)
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
  const map = new Map()
  const fileFolder = new Map()

  for (const { file, rel } of pairs) {
    const parts = rel.split('/').filter(Boolean).slice(0, -1)
    if (!parts.length) { fileFolder.set(file, '__root__'); continue }

    let parentId = null
    for (let i = 0; i < parts.length; i++) {
      const id = parts.slice(0, i+1).join('/')
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
      entry.file(f => res(isMedia(f.name) ? [{ file: f, rel: base + f.name }] : []), () => res([]))
    })
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    const all = []
    const read = () => new Promise((res, rej) => reader.readEntries(res, rej))
    let batch
    do { batch = await read(); all.push(...batch) } while (batch.length)
    const nested = await Promise.all(all.map(e => readEntry(e, `${base}${entry.name}/`)))
    return nested.flat()
  }
  return []
}

/* ═══════════════════════════════════════════════════
   IMPORT  — concurrency limited, streaming to UI
   ═══════════════════════════════════════════════════ */
async function importPairs(pairs) {
  if (!pairs.length) return
  const total = pairs.length
  let done = 0
  setProgress(1)

  const { folders, fileFolder } = buildFolders(pairs)

  // Merge folders into state
  for (const f of folders) {
    if (!state.folders.find(x => x.id === f.id)) state.folders.push(f)
  }

  // Phase 1: probe metadata, 4 at a time, add to grid immediately
  const queue = [...pairs]
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const { file, rel } = queue.shift()
      const id     = uuid()
      const url    = URL.createObjectURL(file)
      const type   = isVideo(file.name) ? 'video' : 'audio'
      const folder = fileFolder.get(file) ?? '__root__'

      let w = null, h = null, dur = null, asp = type === 'audio' ? 'r1x1' : 'r16x9'
      if (type === 'video') {
        const m = await probeVideo(file)
        if (m) { w = m.w; h = m.h; dur = m.dur; asp = aspect(w, h) }
      } else {
        dur = await probeAudio(file)
      }

      const item = { id, name: file.name, type, file, url, thumb: null, dur, w, h, asp, size: file.size, folder, addedAt: Date.now() }
      state.items.push(item)
      appendCard(item)

      done++
      setProgress(Math.round(done / total * 90))
      updateStat()
      renderFolderChips()
    }
  })
  await Promise.all(workers)

  // Phase 2: thumbnails, 2 at a time
  const vidItems = state.items.filter(x => x.type === 'video' && !x.thumb)
  const thumbQ = [...vidItems]
  const thumbWorkers = Array.from({ length: 2 }, async () => {
    while (thumbQ.length) {
      const item = thumbQ.shift()
      const t = await captureThumbnail(item.file)
      if (t) {
        item.thumb = t
        const img = document.querySelector(`[data-id="${item.id}"] .thumb-img`)
        if (img) {
          img.src = t
          img.hidden = false
          // Remove placeholder once thumbnail is ready
          const ph = img.closest('.thumb')?.querySelector('.thumb-placeholder')
          if (ph) ph.style.opacity = '0'
        }
      }
      setProgress(90 + Math.round((vidItems.length - thumbQ.length) / vidItems.length * 10))
    }
  })
  await Promise.all(thumbWorkers)

  setProgress(100)
  setTimeout(() => setProgress(0), 400)
}

/* ═══════════════════════════════════════════════════
   CARD — thumbnail-first, hover-to-preview
   Default: static thumbnail only (zero video decode cost)
   Hover:   create <video>, play inline at preview speed (muted)
   Click:   fullscreen player
   ═══════════════════════════════════════════════════ */

function startPreview(card, item) {
  if (card._vid) return            // already running
  card.classList.add('playing')

  const vid = document.createElement('video')
  vid.className    = 'thumb-video'
  vid.muted        = true
  vid.loop         = true
  vid.playsInline  = true
  vid.preload      = 'auto'
  vid.playbackRate = state.speed
  card._vid = vid

  // Fade in over thumbnail once first frame is ready
  vid.addEventListener('canplay', () => vid.classList.add('visible'), { once: true })

  card.querySelector('.thumb').prepend(vid)
  vid.src = item.url
  vid.play().catch(() => {})

  // Show speed badge
  const spd = card.querySelector('.spd-b')
  if (spd) spd.textContent = state.speed + '×'
}

function stopPreview(card) {
  const vid = card._vid
  if (!vid) return
  card.classList.remove('playing')
  vid.pause()
  vid.src = ''
  vid.remove()
  card._vid = null
}

function makeCard(item) {
  const card = document.createElement('div')
  card.className = 'card'
  card.dataset.id     = item.id
  card.dataset.folder = item.folder
  card.dataset.type   = item.type
  card._vid = null

  if (item.type === 'video') {
    card.innerHTML = `
      <div class="thumb ${item.asp}">
        <div class="thumb-placeholder"></div>
        <img class="thumb-img"${item.thumb ? ` src="${item.thumb}"` : ' hidden'} alt="" />
        <div class="thumb-ov"><div class="play-ring"></div></div>
        <span class="badge bv">Video</span>
        ${item.dur ? `<span class="dur-b">${fmtDur(item.dur)}</span>` : ''}
        <span class="spd-b" style="opacity:0">${state.speed}×</span>
        <div class="prog-bar"><div class="prog-fill"></div></div>
      </div>
      <div class="info">
        <div class="info-name" title="${item.name}">${item.name}</div>
        <div class="info-meta">
          <span>${fmtSize(item.size)}</span>
          ${item.dur ? `<span>·</span><span>${fmtDur(item.dur)}</span>` : ''}
          ${item.w  ? `<span>·</span><span>${item.w}×${item.h}</span>` : ''}
        </div>
      </div>`

    card.addEventListener('mouseenter', () => startPreview(card, item))
    card.addEventListener('mouseleave', () => stopPreview(card))

  } else {
    // Audio card — waveform animation, no video
    const delays = [0,.15,.3,.45,.6,.45,.3,.15,0]
    card.innerHTML = `
      <div class="thumb r1x1">
        <div class="audio-bg">
          <span class="mus-note">♫</span>
          <div class="waves">${delays.map(d => `<div class="wbar" style="animation-delay:${d}s"></div>`).join('')}</div>
        </div>
        <div class="play-dot"></div>
        <span class="badge ba">Audio</span>
        ${item.dur ? `<span class="dur-b">${fmtDur(item.dur)}</span>` : ''}
      </div>
      <div class="info">
        <div class="info-name" title="${item.name}">${item.name}</div>
        <div class="info-meta">
          <span>${fmtSize(item.size)}</span>
          ${item.dur ? `<span>·</span><span>${fmtDur(item.dur)}</span>` : ''}
        </div>
      </div>`

    const ao = new IntersectionObserver(([e]) => card.classList.toggle('playing', e.isIntersecting), { threshold: 0.1 })
    ao.observe(card)
  }

  card.addEventListener('click', () => openPlayer(item))
  return card
}

function appendCard(item) {
  const visible = isItemVisible(item)
  if (!visible) return
  const card = makeCard(item)
  grid.appendChild(card)
  showGrid()
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
  const folder = state.folders.find(f => f.id === item.folder)
  if (folder && !folder.visible) return false
  return true
}

function rebuildGrid() {
  // Stop any active preview before clearing
  grid.querySelectorAll('.card[data-type="video"]').forEach(c => stopPreview(c))
  grid.innerHTML = ''

  const visible = state.items.filter(isItemVisible)
  const frag = document.createDocumentFragment()
  for (const item of visible) frag.appendChild(makeCard(item))
  grid.appendChild(frag)

  showGrid()
  updateStat()
}

function showGrid() {
  const hasItems = state.items.length > 0
  emptyState.hidden = hasItems
  grid.hidden = !hasItems
}

function updateStat() {
  const vis = state.items.filter(isItemVisible)
  const vids = vis.filter(x => x.type === 'video').length
  const auds = vis.filter(x => x.type === 'audio').length
  statTxt.innerHTML = `<b>${vis.length}</b> items &nbsp;·&nbsp; <b>${vids}</b> videos &nbsp;·&nbsp; <b>${auds}</b> audio`
}

function renderFolderChips() {
  folderChips.innerHTML = ''
  for (const f of state.folders) {
    const chip = document.createElement('button')
    chip.className = 'chip' + (f.visible ? ' on' : '')
    chip.textContent = f.name.split('/').pop()
    chip.onclick = () => {
      f.visible = !f.visible
      chip.classList.toggle('on', f.visible)
      rebuildGrid()
    }
    folderChips.appendChild(chip)
  }
}

/* ─── Speed: update all active video cards ─── */
function applySpeed(s) {
  state.speed = s
  spdVal.textContent = s + '×'
  const seekDur = SEEK_SECS[s] ?? 6.5

  document.querySelectorAll('.spd-opt').forEach(el => {
    el.classList.toggle('on', +el.dataset.spd === s)
  })

  grid.querySelectorAll('.card[data-type="video"]').forEach(card => {
    card.style.setProperty('--seek', seekDur + 's')
    const spd = card.querySelector('.spd-b')
    if (spd) spd.textContent = s + '×'
    // Update rate on any card currently being previewed (hovered)
    if (card._vid) card._vid.playbackRate = s
  })
}

/* ═══════════════════════════════════════════════════
   FULLSCREEN PLAYER
   ═══════════════════════════════════════════════════ */
const playerEl   = $('player')
const playerVid  = $('player-video')
const playerOvl  = $('player-overlay')
const pmTitle    = $('pm-title')
const pmProg     = $('pm-prog')
const pmThumb    = $('pm-thumb')
const pmTrack    = $('pm-track')
const pmCur      = $('pm-cur')
const pmDur      = $('pm-dur')
const pmPlayIco  = $('pm-play-ico')
const pmSpinner  = $('pm-spinner')
const pmVf       = $('pm-vf')

let hideTimer = null
let dragActive = false

const PLAY_ICO  = `<polygon points="5 3 19 12 5 21 5 3"/>`
const PAUSE_ICO = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`

function openPlayer(item) {
  state.playerIdx = state.items.indexOf(item)
  loadPlayerItem(item)
  playerEl.hidden = false
  document.body.style.overflow = 'hidden'
}

function loadPlayerItem(item) {
  pmTitle.textContent = item.name
  playerVid.src = item.url
  playerVid.load()
  playerVid.play().catch(() => {})
  pmSpinner.hidden = false
  showOverlay()
}

function closePlayer() {
  playerVid.pause()
  playerVid.src = ''
  playerEl.hidden = true
  document.body.style.overflow = ''
  clearTimeout(hideTimer)
}

function showOverlay() {
  playerOvl.classList.add('show')
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => playerOvl.classList.remove('show'), 3000)
}

playerVid.addEventListener('timeupdate', () => {
  if (dragActive || !playerVid.duration) return
  const pct = playerVid.currentTime / playerVid.duration * 100
  pmProg.style.width = pct + '%'
  pmThumb.style.left = pct + '%'
  pmCur.textContent = fmtDur(playerVid.currentTime)
})
playerVid.addEventListener('loadedmetadata', () => {
  pmDur.textContent = fmtDur(playerVid.duration)
})
playerVid.addEventListener('waiting',  () => { pmSpinner.hidden = false })
playerVid.addEventListener('playing',  () => { pmSpinner.hidden = true; pmPlayIco.innerHTML = PAUSE_ICO })
playerVid.addEventListener('pause',    () => { pmPlayIco.innerHTML = PLAY_ICO })
playerVid.addEventListener('ended',    () => navigatePlayer(1))

// Progress bar drag
function seekTo(e) {
  const rect = pmTrack.getBoundingClientRect()
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerVid.currentTime = pct * playerVid.duration
  pmProg.style.width = pct * 100 + '%'
  pmThumb.style.left = pct * 100 + '%'
}
pmTrack.addEventListener('mousedown', e => {
  dragActive = true; pmTrack.classList.add('dragging')
  seekTo(e)
  const onMove = e => seekTo(e)
  const onUp   = () => { dragActive = false; pmTrack.classList.remove('dragging'); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
})

// Volume bar
$('pm-vt').addEventListener('click', e => {
  const rect = e.currentTarget.getBoundingClientRect()
  const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  playerVid.volume = vol
  pmVf.style.width = vol * 100 + '%'
})

function navigatePlayer(dir) {
  const visible = state.items.filter(isItemVisible)
  const cur = visible.findIndex(x => x === state.items[state.playerIdx])
  const next = visible[(cur + dir + visible.length) % visible.length]
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
  if (e.key === 'Escape')      closePlayer()
  else if (e.key === ' ')      { e.preventDefault(); playerVid.paused ? playerVid.play() : playerVid.pause() }
  else if (e.key === 'ArrowRight') playerVid.currentTime = Math.min(playerVid.duration, playerVid.currentTime + 5)
  else if (e.key === 'ArrowLeft')  playerVid.currentTime = Math.max(0, playerVid.currentTime - 5)
  else if (e.key === 'ArrowUp')    playerVid.volume = Math.min(1, playerVid.volume + 0.1)
  else if (e.key === 'ArrowDown')  playerVid.volume = Math.max(0, playerVid.volume - 0.1)
  else if (e.key === 'n')      navigatePlayer(1)
  else if (e.key === 'p')      navigatePlayer(-1)
})

/* ═══════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════ */
function applyTheme(id) {
  state.theme = id
  document.documentElement.dataset.theme = id
  localStorage.setItem('mv-theme', id)
  themeGrid.querySelectorAll('.theme-item').forEach(el => el.classList.toggle('on', el.dataset.t === id))
}

// Build theme grid
themeGrid.innerHTML = THEMES.map(t => `
  <div class="theme-item ${t.id === state.theme ? 'on' : ''}" data-t="${t.id}">
    <div class="theme-preview" style="background:${t.bg}">
      <div class="theme-dot" style="background:${t.ac}"></div>
    </div>
    <span class="theme-label">${t.label}</span>
    ${t.id === state.theme ? '<span class="theme-check">✓</span>' : ''}
  </div>`).join('')

themeGrid.addEventListener('click', e => {
  const item = e.target.closest('.theme-item')
  if (item) { applyTheme(item.dataset.t); themePop.hidden = true }
})
applyTheme(state.theme)

$('theme-btn').onclick = e => { e.stopPropagation(); themePop.hidden = !themePop.hidden }
document.addEventListener('click', e => {
  if (!$('theme-wrap').contains(e.target)) themePop.hidden = true
  if (!$('spd-wrap').contains(e.target)) spdPop.hidden = true
})

/* ── Speed ── */
$('spd-btn').onclick = e => { e.stopPropagation(); spdPop.hidden = !spdPop.hidden }
spdPop.addEventListener('click', e => {
  const opt = e.target.closest('.spd-opt')
  if (opt) { applySpeed(+opt.dataset.spd); spdPop.hidden = true }
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
  searchInput.value = ''; state.search = ''
  searchClear.classList.remove('show')
  rebuildGrid()
}

/* ═══════════════════════════════════════════════════
   FILE IMPORT
   ═══════════════════════════════════════════════════ */
function filesToPairs(fileList) {
  return Array.from(fileList)
    .filter(f => isMedia(f.name))
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

// Drop zone
let dropDepth = 0
const dropOv = $('drop-ov')
document.addEventListener('dragenter', e => { e.preventDefault(); dropDepth++; dropOv.classList.add('active') })
document.addEventListener('dragleave', () => { if (--dropDepth <= 0) { dropDepth = 0; dropOv.classList.remove('active') } })
document.addEventListener('dragover',  e => e.preventDefault())
document.addEventListener('drop', e => {
  e.preventDefault(); dropDepth = 0; dropOv.classList.remove('active')
  handleDrop(e.dataTransfer)
})

// File inputs — labels in HTML handle the click, just listen to change
$('input-files').addEventListener('change', function() {
  if (this.files?.length) importPairs(filesToPairs(this.files))
  this.value = ''
})
$('input-folder').addEventListener('change', function() {
  if (this.files?.length) importPairs(filesToPairs(this.files))
  this.value = ''
})
