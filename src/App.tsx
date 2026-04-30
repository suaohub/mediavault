import { useCallback, useState } from 'react'
import { useStore } from './store'
import { readDroppedItems, processFilesStreamingV2, readInputFiles } from './utils'
import DropZone   from './components/DropZone'
import Header     from './components/Header'
import Subbar     from './components/Subbar'
import MediaGrid  from './components/MediaGrid'
import MiniPlayer    from './components/MiniPlayer'
import PlayerModal   from './components/PlayerModal'
import './style.css'

function EmptyState({ onImport }: { onImport: (pairs: { file: File; relativePath: string }[]) => void }) {
  const triggerFile   = () => document.getElementById('es-file')?.click()
  const triggerFolder = () => document.getElementById('es-folder')?.click()

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const pairs = readInputFiles(files)
    if (pairs.length > 0) onImport(pairs)
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
  const mediaFiles       = useStore(s => s.mediaFiles)
  const { addFiles, updateThumbnail } = useStore()

  // 0 = idle, 1–99 = loading, 100 = briefly shown then cleared
  const [progress, setProgress] = useState(0)

  const handlePairs = useCallback(async (pairs: { file: File; relativePath: string }[]) => {
    if (pairs.length === 0) return

    const total = pairs.length
    let done    = 0
    setProgress(1)

    await processFilesStreamingV2(
      pairs,
      (batchFiles, folders) => {
        addFiles(batchFiles, folders)
        done += batchFiles.length
        // Reserve last 5% for thumbnail phase
        setProgress(Math.min(Math.round((done / total) * 95), 95))
      },
      (id, thumbUrl) => {
        updateThumbnail(id, thumbUrl)
      }
    )

    setProgress(100)
    setTimeout(() => setProgress(0), 400)
  }, [addFiles, updateThumbnail])

  const handleDrop = useCallback(async (dt: DataTransfer) => {
    const pairs = await readDroppedItems(dt)
    handlePairs(pairs)
  }, [handlePairs])

  return (
    <>
      {/* Accurate progress bar — width driven by real batch completion */}
      {progress > 0 && (
        <div
          className="loading-bar"
          style={{
            width: `${progress}%`,
            transition: progress === 100 ? 'width .1s, opacity .3s .1s' : 'width .2s',
            opacity: progress === 100 ? 0 : 1,
          }}
        />
      )}

      <DropZone onDrop={handleDrop} />
      <Header onImport={handlePairs} />
      <Subbar />

      <main className="main">
        {mediaFiles.length === 0
          ? <EmptyState onImport={handlePairs} />
          : <MediaGrid />
        }
      </main>

      <MiniPlayer />
      <PlayerModal />
    </>
  )
}
