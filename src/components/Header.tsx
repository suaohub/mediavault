import { useRef, useState, useEffect } from 'react'
import { useStore } from '../store'
import { processFiles, readInputFiles, captureThumbnail } from '../utils'

/* ─── Theme definitions ─── */
export const THEMES = [
  { id: 'dark',    label: '暗紫',   ac: '#6366f1', bg: '#090909' },
  { id: 'light',   label: '浅色',   ac: '#5856d6', bg: '#f2f2f7' },
  { id: 'space',   label: '深空',   ac: '#f59e0b', bg: '#060818' },
  { id: 'warm',    label: '暖焦糖', ac: '#f97316', bg: '#0d0804' },
  { id: 'emerald', label: '翠绿',   ac: '#10b981', bg: '#050e08' },
  { id: 'rose',    label: '玫瑰',   ac: '#f43f5e', bg: '#0f0508' },
]

/* ─── Icons ─── */
const IcoSearch = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>
const IcoFile   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const IcoFolder = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
const IcoGrid   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const IcoPalette = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
const IcoX      = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

/* ─── Theme picker ─── */
function ThemePicker() {
  const theme    = useStore(s => s.theme)
  const setTheme = useStore(s => s.setTheme)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onOut = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  return (
    <div className="theme-wrap" ref={ref}>
      <button
        className="btn btn-ghost"
        title="切换主题"
        onClick={() => setOpen(o => !o)}
        style={{ padding: '6px 9px' }}
      >
        <IcoPalette />
      </button>

      {open && (
        <div className="theme-pop">
          <div className="theme-pop-hd">主题</div>
          <div className="theme-grid">
            {THEMES.map(t => (
              <div
                key={t.id}
                className={`theme-item ${theme === t.id ? 'on' : ''}`}
                onClick={() => { setTheme(t.id); setOpen(false) }}
                title={t.label}
              >
                <div className="theme-preview" style={{ background: t.bg }}>
                  <div className="theme-dot" style={{ background: t.ac }} />
                </div>
                <span className="theme-label">{t.label}</span>
                {theme === t.id && <span className="theme-check">✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Header ─── */
interface Props {
  onImportStart: () => void
  onImportEnd:   () => void
}

export default function Header({ onImportStart, onImportEnd }: Props) {
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { addFiles, updateThumbnail, searchQuery, setSearchQuery } = useStore()

  const handlePairs = async (pairs: ReturnType<typeof readInputFiles>) => {
    if (pairs.length === 0) return
    onImportStart()
    const { mediaFiles, folders } = await processFiles(pairs)
    addFiles(mediaFiles, folders)
    onImportEnd()
    for (const mf of mediaFiles.filter(f => f.mediaType === 'video')) {
      captureThumbnail(mf.file).then(thumb => { if (thumb) updateThumbnail(mf.id, thumb) })
    }
  }

  return (
    <header className="header">
      {/* Logo */}
      <div className="logo">
        <div className="logo-mark" />
        MediaVault
      </div>

      {/* Search */}
      <div className="search-wrap">
        <span className="search-ico"><IcoSearch /></span>
        <input
          type="text"
          placeholder="搜索文件名…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--mu)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <IcoX />
          </button>
        )}
      </div>

      {/* Right actions */}
      <div className="h-right">
        <ThemePicker />
        <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
          <IcoFile /> 导入文件
        </button>
        <button className="btn btn-ghost" onClick={() => folderInputRef.current?.click()}>
          <IcoFolder /> 导入文件夹
        </button>
        <button className="btn btn-pri" onClick={() => fileInputRef.current?.click()}>
          + 添加
        </button>
        <div className="seg">
          <button className="on"><IcoGrid /></button>
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef} type="file" multiple
        accept="video/*,audio/*,.mkv,.flv,.ts,.m2ts,.flac,.opus,.aiff"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) { handlePairs(readInputFiles(e.target.files)); e.target.value = '' } }}
      />
      {/* @ts-ignore webkitdirectory */}
      <input
        ref={folderInputRef} type="file" multiple
        {...{ webkitdirectory: '', mozdirectory: '' }}
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) { handlePairs(readInputFiles(e.target.files)); e.target.value = '' } }}
      />
    </header>
  )
}
