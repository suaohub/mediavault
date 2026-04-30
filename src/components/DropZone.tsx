import { useEffect, useState } from 'react'

interface Props {
  onDrop: (dt: DataTransfer) => void
}

export default function DropZone({ onDrop }: Props) {
  const [active, setActive] = useState(false)
  const [_depth, setDepth] = useState(0)

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      setDepth(d => d + 1)
      setActive(true)
    }
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      setDepth(d => {
        const next = d - 1
        if (next <= 0) setActive(false)
        return Math.max(0, next)
      })
    }
    const onDragOver = (e: DragEvent) => { e.preventDefault() }
    const onDropEv   = (e: DragEvent) => {
      e.preventDefault()
      setActive(false)
      setDepth(0)
      if (e.dataTransfer) onDrop(e.dataTransfer)
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('dragover',  onDragOver)
    document.addEventListener('drop',      onDropEv)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('dragover',  onDragOver)
      document.removeEventListener('drop',      onDropEv)
    }
  }, [onDrop])

  return (
    <div className={`drop-ov ${active ? 'active' : ''}`}>
      <div className="drop-ov-inner">
        <div className="drop-body">
          <span className="drop-emoji">📂</span>
          <h2>拖入媒体文件或文件夹</h2>
          <p>支持视频与音频，可同时放入多个文件夹</p>
          <div className="drop-fmts">
            {['MP4','MOV','MKV','AVI','MP3','FLAC','WAV','M4A'].map(f => (
              <span key={f} className="fmt">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
