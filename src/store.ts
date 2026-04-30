import { create } from 'zustand'
import type { MediaFile, FolderNode, TypeFilter } from './types'
import { mergeFolderTrees } from './utils'

// Apply saved theme immediately before React renders
const _savedTheme = localStorage.getItem('mv-theme') ?? 'dark'
document.documentElement.setAttribute('data-theme', _savedTheme)

interface AppState {
  mediaFiles: MediaFile[]
  folders: FolderNode[]
  previewSpeed: number
  typeFilter: TypeFilter
  searchQuery: string
  currentPlayer: MediaFile | null
  /** id of the folder chip dropdown currently open */
  openDropdown: string | null
  theme: string
}

interface AppActions {
  addFiles: (files: MediaFile[], newFolders: FolderNode[]) => void
  updateThumbnail: (id: string, thumbnail: string) => void
  setPreviewSpeed: (speed: number) => void
  setTypeFilter: (f: TypeFilter) => void
  setSearchQuery: (q: string) => void
  openPlayer: (file: MediaFile) => void
  closePlayer: () => void
  toggleFolder: (id: string) => void
  setFolderSubtreeVisible: (rootId: string, visible: boolean) => void
  setOpenDropdown: (id: string | null) => void
  setTheme: (t: string) => void
}

type Store = AppState & AppActions

/* ── folder tree helpers ── */
const mapTree = (nodes: FolderNode[], id: string, fn: (n: FolderNode) => FolderNode): FolderNode[] =>
  nodes.map(n => {
    if (n.id === id) return fn(n)
    return { ...n, children: mapTree(n.children, id, fn) }
  })

const setSubtree = (nodes: FolderNode[], rootId: string, visible: boolean): FolderNode[] =>
  nodes.map(n => {
    if (n.id === rootId) return setAllVisible(n, visible)
    return { ...n, children: setSubtree(n.children, rootId, visible) }
  })

const setAllVisible = (node: FolderNode, visible: boolean): FolderNode => ({
  ...node,
  visible,
  children: node.children.map(c => setAllVisible(c, visible)),
})

/* ── store ── */
export const useStore = create<Store>((set) => ({
  mediaFiles: [],
  folders: [],
  previewSpeed: 3,
  typeFilter: 'all',
  searchQuery: '',
  currentPlayer: null,
  openDropdown: null,
  theme: _savedTheme,

  addFiles: (files, newFolders) =>
    set(s => ({
      mediaFiles: [...s.mediaFiles, ...files],
      folders: mergeFolderTrees(s.folders, newFolders),
    })),

  updateThumbnail: (id, thumbnail) =>
    set(s => ({
      mediaFiles: s.mediaFiles.map(f => (f.id === id ? { ...f, thumbnail } : f)),
    })),

  setPreviewSpeed: (speed) => set({ previewSpeed: speed }),

  setTypeFilter: (typeFilter) => set({ typeFilter }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mv-theme', theme)
    set({ theme })
  },

  openPlayer: (file) => set({ currentPlayer: file }),

  closePlayer: () => set({ currentPlayer: null }),

  toggleFolder: (id) =>
    set(s => ({
      folders: mapTree(s.folders, id, n => ({ ...n, visible: !n.visible })),
    })),

  setFolderSubtreeVisible: (rootId, visible) =>
    set(s => ({ folders: setSubtree(s.folders, rootId, visible) })),

  setOpenDropdown: (id) => set({ openDropdown: id }),
}))

/* ── derived selectors ── */
export function getEffectiveVisibility(folders: FolderNode[]): Map<string, boolean> {
  const map = new Map<string, boolean>()

  const walk = (node: FolderNode, parentVis: boolean) => {
    const eff = parentVis && node.visible
    map.set(node.id, eff)
    node.children.forEach(c => walk(c, eff))
  }

  folders.forEach(r => walk(r, true))

  // Always include __root__ (files dropped without a folder)
  if (!map.has('__root__')) map.set('__root__', true)

  return map
}
