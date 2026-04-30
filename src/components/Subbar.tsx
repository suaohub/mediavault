import { useEffect, useRef } from 'react'
import { useStore, getEffectiveVisibility } from '../store'
import type { FolderNode } from '../types'

const SPEEDS = [1, 1.5, 2, 3, 4]

/** Compute folder file counts */
function useFolderCounts() {
  const mediaFiles = useStore(s => s.mediaFiles)
  const counts = new Map<string, number>()
  for (const f of mediaFiles) {
    counts.set(f.folderId, (counts.get(f.folderId) ?? 0) + 1)
  }
  return counts
}

/** Whether any descendant is visible */
function anyChildVisible(node: FolderNode): boolean {
  return node.visible || node.children.some(anyChildVisible)
}
function allChildrenVisible(node: FolderNode): boolean {
  return node.visible && node.children.every(allChildrenVisible)
}

const IcoFolder = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
)
const IcoEye = ({ crossed }: { crossed: boolean }) => crossed ? (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)
const IcoSpeed = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IcoChevDown = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

/* ─── Folder dropdown item ─── */
function FolderItem({ node, depth, counts }: { node: FolderNode; depth: number; counts: Map<string, number> }) {
  const { toggleFolder } = useStore()
  const cnt = counts.get(node.id) ?? 0

  return (
    <>
      <div
        className={`dd-row ${depth > 0 ? 'dd-sub' : ''} ${!node.visible ? 'di-off' : ''}`}
        onClick={() => toggleFolder(node.id)}
      >
        <span className="dd-ico"><IcoFolder size={12} /></span>
        <span className="dd-name">{node.name}</span>
        {cnt > 0 && <span className="dd-cnt">{cnt}</span>}
        <span className="dd-eye"><IcoEye crossed={!node.visible} /></span>
      </div>
      {node.children.map(c => (
        <FolderItem key={c.id} node={c} depth={depth + 1} counts={counts} />
      ))}
    </>
  )
}

/* ─── Folder chip with dropdown ─── */
function FolderChip({ node }: { node: FolderNode }) {
  const { openDropdown, setOpenDropdown, setFolderSubtreeVisible } = useStore()
  const counts = useFolderCounts()
  const ref = useRef<HTMLDivElement>(null)
  const isOpen = openDropdown === node.id

  const vis = allChildrenVisible(node)
  const partial = !vis && anyChildVisible(node)
  const chipCls = `chip ${vis ? '' : partial ? 'partial' : 'foff'}`

  // Close on outside click
  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (isOpen && ref.current && !ref.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [isOpen, setOpenDropdown])

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenDropdown(isOpen ? null : node.id)
  }

  return (
    <div className={`fc-wrap ${isOpen ? 'open' : ''}`} ref={ref}>
      <div className={chipCls} onClick={toggleOpen}>
        <IcoFolder />
        {node.name}
        <em className="fc-arr"><IcoChevDown /></em>
      </div>

      {isOpen && (
        <div className="fc-dd">
          <div className="dd-head">
            {node.name}
            <span className="dd-all" onClick={() => setFolderSubtreeVisible(node.id, !vis)}>
              {vis ? '全部隐藏' : '全部显示'}
            </span>
          </div>
          <FolderItem node={node} depth={0} counts={counts} />
        </div>
      )}
    </div>
  )
}

/* ─── Speed control ─── */
function SpeedControl() {
  const { previewSpeed, setPreviewSpeed, openDropdown, setOpenDropdown } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const isOpen = openDropdown === '__spd__'

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (isOpen && ref.current && !ref.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [isOpen, setOpenDropdown])

  const pick = (v: number) => {
    setPreviewSpeed(v)
    setOpenDropdown(null)
  }

  return (
    <div className="spd-wrap" ref={ref}>
      <div className="spd-btn" onClick={() => setOpenDropdown(isOpen ? null : '__spd__')}>
        <span className="spd-dot" />
        <IcoSpeed />
        <span>预览速度</span>
        <span className="spd-val">{previewSpeed}×</span>
      </div>
      {isOpen && (
        <div className="spd-pop">
          {SPEEDS.map(v => (
            <div
              key={v}
              className={`spd-opt ${previewSpeed === v ? 'on' : ''}`}
              onClick={() => pick(v)}
            >
              {v}×
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Subbar ─── */
export default function Subbar() {
  const { mediaFiles, folders, typeFilter, setTypeFilter } = useStore()
  const visMap = getEffectiveVisibility(folders)

  const total  = mediaFiles.length
  const videos = mediaFiles.filter(f => f.mediaType === 'video').length
  const audios = mediaFiles.filter(f => f.mediaType === 'audio').length

  // Root folder chips (nodes with parentId === null)
  const rootFolders = folders.filter(n => n.id !== '__root__')
  const hasRoot     = mediaFiles.some(f => f.folderId === '__root__')

  // Invisible folders for "__root__"
  const rootNodeVis = visMap.get('__root__') ?? true

  const FILTERS = [
    { k: 'all',    label: '全部',   n: total  },
    { k: 'video',  label: '视频',   n: videos },
    { k: 'audio',  label: '音频',   n: audios },
    { k: 'recent', label: '最近添加', n: null  },
  ] as const

  return (
    <div className="subbar">
      <span className="stat-txt"><b>{total}</b> 项</span>

      <div className="chips-row">
        {/* Type filters */}
        {FILTERS.map(f => (
          <div
            key={f.k}
            className={`chip ${typeFilter === f.k ? 'on' : ''}`}
            onClick={() => setTypeFilter(f.k)}
          >
            {f.label}{f.n != null ? ` · ${f.n}` : ''}
          </div>
        ))}

        {/* Separator before folders */}
        {(rootFolders.length > 0 || hasRoot) && (
          <div className="chip-div" />
        )}

        {/* Folder chips for named root folders */}
        {rootFolders.map(node => (
          <FolderChip key={node.id} node={node} />
        ))}

        {/* Chip for drop-root (no folder) files */}
        {hasRoot && (
          <div
            className={`chip ${rootNodeVis ? '' : 'foff'}`}
            onClick={() => useStore.getState().toggleFolder('__root__')}
          >
            <IcoFolder />
            未分类
          </div>
        )}
      </div>

      <SpeedControl />
    </div>
  )
}
