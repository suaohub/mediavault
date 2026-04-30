import type { AspectClass, FolderNode, MediaFile, MediaType } from './types'

/* ─────────────────────────────────────────
   FILE TYPE HELPERS
───────────────────────────────────────── */
const VIDEO_EXTS = new Set(['mp4','mov','mkv','avi','webm','m4v','wmv','flv','ts','m2ts'])
const AUDIO_EXTS = new Set(['mp3','flac','wav','aac','ogg','opus','m4a','wma','aiff'])

export function isMediaFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)
}

export function getMediaType(file: File): MediaType {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_EXTS.has(ext) ? 'audio' : 'video'
}

/* ─────────────────────────────────────────
   FORMATTING
───────────────────────────────────────── */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatDuration(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return '--:--'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/* ─────────────────────────────────────────
   ASPECT RATIO
───────────────────────────────────────── */
export function getAspectClass(w: number, h: number): AspectClass {
  if (!w || !h) return 'r16x9'
  const r = w / h
  if (r >= 2.2)  return 'r21x9'
  if (r >= 1.55) return 'r16x9'
  if (r >= 1.1)  return 'r4x3'
  if (r >= 0.9)  return 'r1x1'
  if (r >= 0.6)  return 'r4x3'
  return 'r9x16'
}

/* ─────────────────────────────────────────
   CONCURRENCY LIMITER
   Run at most `limit` promises at a time.
───────────────────────────────────────── */
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onDone?: (result: T, index: number) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0

  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
      onDone?.(results[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

/* ─────────────────────────────────────────
   VIDEO METADATA
───────────────────────────────────────── */
export function probeVideo(file: File): Promise<{
  width: number; height: number; duration: number; aspectClass: AspectClass
} | null> {
  return new Promise((resolve) => {
    const vid = document.createElement('video')
    const url = URL.createObjectURL(file)
    let done = false

    const finish = (result: { width: number; height: number; duration: number; aspectClass: AspectClass } | null) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      vid.src = ''
      resolve(result)
    }

    vid.preload = 'metadata'
    vid.muted = true
    vid.addEventListener('loadedmetadata', () => {
      finish({
        width: vid.videoWidth,
        height: vid.videoHeight,
        duration: vid.duration,
        aspectClass: getAspectClass(vid.videoWidth, vid.videoHeight),
      })
    })
    vid.addEventListener('error', () => finish(null))
    setTimeout(() => finish(null), 8000)
    vid.src = url
  })
}

export function probeAudio(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const aud = new Audio()
    const url = URL.createObjectURL(file)
    let done = false

    const finish = (dur: number | null) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      aud.src = ''
      resolve(dur)
    }

    aud.preload = 'metadata'
    aud.addEventListener('loadedmetadata', () => finish(aud.duration))
    aud.addEventListener('error', () => finish(null))
    setTimeout(() => finish(null), 6000)
    aud.src = url
  })
}

/* ─────────────────────────────────────────
   THUMBNAIL
   Returns an objectURL pointing to a Blob (not a base64 DataURL).
   Much faster to create, ~35% less memory, and can be precisely revoked.
───────────────────────────────────────── */
export function captureThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const vid = document.createElement('video')
    const url = URL.createObjectURL(file)
    let done = false

    const finish = (result: string | null) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      vid.src = ''
      resolve(result)
    }

    vid.preload = 'metadata'
    vid.muted = true

    vid.addEventListener('loadedmetadata', () => {
      vid.currentTime = Math.min(vid.duration * 0.1, 3)
    })

    vid.addEventListener('seeked', () => {
      try {
        // Cap at 480px wide — enough for a card thumbnail, saves ~40% vs 640px
        const W = Math.min(vid.videoWidth, 480)
        const H = Math.round(W * vid.videoHeight / vid.videoWidth)
        const canvas = document.createElement('canvas')
        canvas.width  = W
        canvas.height = H
        canvas.getContext('2d')!.drawImage(vid, 0, 0, W, H)
        canvas.toBlob(
          blob => finish(blob ? URL.createObjectURL(blob) : null),
          'image/jpeg',
          0.72
        )
      } catch {
        finish(null)
      }
    })

    vid.addEventListener('error', () => finish(null))
    setTimeout(() => finish(null), 12000)
    vid.src = url
  })
}

/* ─────────────────────────────────────────
   FOLDER TREE BUILDER
───────────────────────────────────────── */
export function buildFolderTree(pairs: { file: File; relativePath: string }[]): {
  roots: FolderNode[]
  fileToFolder: Map<File, string>
} {
  const nodeMap = new Map<string, FolderNode>()
  const fileToFolder = new Map<File, string>()

  const getOrCreate = (id: string, name: string, parentId: string | null): FolderNode => {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, name, parentId, visible: true, children: [] })
    }
    return nodeMap.get(id)!
  }

  getOrCreate('__root__', '未分类', null)

  for (const { file, relativePath } of pairs) {
    const parts = relativePath.split('/').filter(Boolean)
    const folderParts = parts.slice(0, -1)

    if (folderParts.length === 0) {
      fileToFolder.set(file, '__root__')
      continue
    }

    let parentId: string | null = null
    for (let i = 0; i < folderParts.length; i++) {
      const id = folderParts.slice(0, i + 1).join('/')
      const node = getOrCreate(id, folderParts[i], parentId)

      if (parentId !== null) {
        const parent = nodeMap.get(parentId)!
        if (!parent.children.some(c => c.id === id)) {
          parent.children.push(node)
        }
      }

      parentId = id
    }

    fileToFolder.set(file, parentId ?? '__root__')
  }

  const roots: FolderNode[] = []
  for (const node of nodeMap.values()) {
    if (node.parentId === null) roots.push(node)
  }

  roots.sort((a, b) => {
    if (a.id === '__root__') return 1
    if (b.id === '__root__') return -1
    return a.name.localeCompare(b.name, 'zh')
  })

  return { roots, fileToFolder }
}

export function mergeFolderTrees(existing: FolderNode[], incoming: FolderNode[]): FolderNode[] {
  const existMap = new Map<string, FolderNode>()
  const flatten = (nodes: FolderNode[]) => {
    for (const n of nodes) { existMap.set(n.id, n); flatten(n.children) }
  }
  flatten(existing)

  const mergeNode = (node: FolderNode): FolderNode => {
    const found = existMap.get(node.id)
    return {
      ...node,
      visible: found?.visible ?? true,
      children: node.children.map(mergeNode),
    }
  }

  const mergedIds = new Set(incoming.map(n => n.id))
  const kept = existing.filter(n => !mergedIds.has(n.id))
  return [...kept, ...incoming.map(mergeNode)].sort((a, b) => {
    if (a.id === '__root__') return 1
    if (b.id === '__root__') return -1
    return a.name.localeCompare(b.name, 'zh')
  })
}

/* ─────────────────────────────────────────
   DRAG & DROP — RECURSIVE DIRECTORY READ
───────────────────────────────────────── */
async function readEntry(
  entry: FileSystemEntry,
  basePath: string
): Promise<{ file: File; relativePath: string }[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      ;(entry as FileSystemFileEntry).file(
        (f) => {
          if (isMediaFile(f)) resolve([{ file: f, relativePath: `${basePath}${f.name}` }])
          else resolve([])
        },
        () => resolve([])
      )
    })
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    const allEntries: FileSystemEntry[] = []

    const read = (): Promise<FileSystemEntry[]> =>
      new Promise((res, rej) => reader.readEntries(res, rej))

    let batch: FileSystemEntry[]
    do {
      batch = await read()
      allEntries.push(...batch)
    } while (batch.length > 0)

    const results = await Promise.all(
      allEntries.map(e => readEntry(e, `${basePath}${dirEntry.name}/`))
    )
    return results.flat()
  }

  return []
}

export async function readDroppedItems(dt: DataTransfer): Promise<{ file: File; relativePath: string }[]> {
  const results: { file: File; relativePath: string }[][] = []

  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry()
    if (!entry) continue
    results.push(await readEntry(entry, ''))
  }

  return results.flat()
}

export function readInputFiles(fileList: FileList): { file: File; relativePath: string }[] {
  return Array.from(fileList)
    .filter(isMediaFile)
    .map(f => ({
      file: f,
      relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    }))
}

/**
 * Runs metadata probing and thumbnail generation in two separate concurrent
 * phases, streaming results to the UI as they arrive.
 */
export async function processFilesStreamingV2(
  pairs: { file: File; relativePath: string }[],
  onBatch:     (files: MediaFile[], folders: FolderNode[]) => void,
  onThumbnail: (id: string, url: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const { roots, fileToFolder } = buildFolderTree(pairs)

  const PROBE_CONCURRENCY = 4
  const THUMB_CONCURRENCY = 2
  const BATCH_SIZE        = 8

  // id → file mapping for thumbnail phase
  const fileIdMap = new Map<File, string>()

  // ── Phase 1: metadata ──
  const pending: MediaFile[] = []
  let foldersEmitted = false

  const metaTasks = pairs.map(({ file }) => async (): Promise<MediaFile | null> => {
    if (signal?.aborted) return null

    const id   = crypto.randomUUID()
    const url  = URL.createObjectURL(file)
    const type = getMediaType(file)

    fileIdMap.set(file, id)

    let width: number | null       = null
    let height: number | null      = null
    let duration: number | null    = null
    let aspectClass: AspectClass   = type === 'audio' ? 'r1x1' : 'r16x9'

    if (type === 'video') {
      const meta = await probeVideo(file)
      if (meta) { width = meta.width; height = meta.height; duration = meta.duration; aspectClass = meta.aspectClass }
    } else {
      duration = await probeAudio(file)
    }

    return {
      id, name: file.name, mediaType: type, file, url,
      thumbnail: null, duration, width, height, aspectClass,
      size: file.size, folderId: fileToFolder.get(file) ?? '__root__',
      addedAt: Date.now(),
    } satisfies MediaFile
  })

  await pLimit(metaTasks, PROBE_CONCURRENCY, (result) => {
    if (!result || signal?.aborted) return
    pending.push(result)

    if (pending.length >= BATCH_SIZE) {
      onBatch(pending.splice(0), foldersEmitted ? [] : roots)
      foldersEmitted = true
    }
  })

  if (pending.length > 0) {
    onBatch(pending.splice(0), foldersEmitted ? [] : roots)
  }

  // ── Phase 2: thumbnails (only video files) ──
  const videoPairs = pairs.filter(({ file }) => getMediaType(file) === 'video')
  const thumbTasks2 = videoPairs.map(({ file }) => async () => {
    if (signal?.aborted) return
    const id = fileIdMap.get(file)
    if (!id) return
    const thumbUrl = await captureThumbnail(file)
    if (thumbUrl) onThumbnail(id, thumbUrl)
  })

  await pLimit(thumbTasks2, THUMB_CONCURRENCY)
}
