import { useCallback, useState } from 'react'
import { useStore } from './store'
import { readDroppedItems, processFiles, captureThumbnail } from './utils'
import DropZone  from './components/DropZone'
import Header    from './components/Header'
import Subbar    from './components/Subbar'
import MediaGrid from './components/MediaGrid'
import MiniPlayer   from './components/MiniPlayer'
import PlayerModal  from './components/PlayerModal'
import './style.css'

function EmptyState({ onImportStart, onImportEnd }: { onImportStart: () => void; onImportEnd: () => void }) {
  const { addFiles, updateThumbnail } = useStore()

  const triggerFile   = () => document.getElementById('es-file')?.click()
  const triggerFolder = () => document.getElementById('es-folder')?.click()

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const pairs = Array.from(files).map(f => ({
      file: f,
      relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    }))
    if (pairs.length === 0) return
    onImportStart()
    const { mediaFiles, folders } = await processFiles(pairs)
    addFiles(mediaFiles, folders)
    onImportEnd()
    for (const mf of mediaFiles.filter(f => f.mediaType === 'video')) {
      captureThumbnail(mf.file).then(t => { if (t) updateThumbnail(mf.id, t) })
    }
    e.target.value = ''
  }

  return (
    <div className="empty">
      <div className="empty-icon">🎬</div>
      <h2>导入你的媒体库</h2>
      <p>支持直接拖拽文件或文件夹到窗口中，也可以点击下方按钮选择文件。</p>
      <div className="empty-actions">
        <button className="btn btn-pri" onClick={triggerFile}>选择视频 / 音频文件</button>
        <button className="btn btn-ghost" onClick={triggerFolder}>选择文件夹</button>
      </div>
      <div className="empty-fmts">
        {['MP4','MOV','MKV','AVI','WEBM','MP3','FLAC','WAV','M4A','AAC'].map(f => (
          <span key={f} className="fmt">{f}</span>
        ))}
      </div>

      <input id="es-file"   type="file" multiple accept="video/*,audio/*,.mkv,.flv" style={{ display:'none' }} onChange={handleInput} />
      {/* @ts-ignore */}
      <input id="es-folder" type="file" multiple {...{ webkitdirectory: '' }} style={{ display:'none' }} onChange={handleInput} />
    </div>
  )
}

export default function App() {
  const mediaFiles = useStore(s => s.mediaFiles)
  const { addFiles, updateThumbnail } = useStore()
  const [loading, setLoading] = useState(false)

  const onImportStart = useCallback(() => setLoading(true),  [])
  const onImportEnd   = useCallback(() => setLoading(false), [])

  const handleDrop = useCallback(async (dt: DataTransfer) => {
    const pairs = await readDroppedItems(dt)
    if (pairs.length === 0) return
    setLoading(true)
    const { mediaFiles: mfs, folders } = await processFiles(pairs)
    addFiles(mfs, folders)
    setLoading(false)
    for (const mf of mfs.filter(f => f.mediaType === 'video')) {
      captureThumbnail(mf.file).then(t => { if (t) updateThumbnail(mf.id, t) })
    }
  }, [addFiles, updateThumbnail])

  return (
    <>
      {/* Loading progress bar */}
      {loading && <div className="loading-bar" style={{ width: '66%' }} />}

      <DropZone onDrop={handleDrop} />
      <Header onImportStart={onImportStart} onImportEnd={onImportEnd} />
      <Subbar />

      <main className="main">
        {mediaFiles.length === 0
          ? <EmptyState onImportStart={onImportStart} onImportEnd={onImportEnd} />
          : <MediaGrid />
        }
      </main>

      <MiniPlayer />
      <PlayerModal />
    </>
  )
}
