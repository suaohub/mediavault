import { useMemo } from 'react'
import { useStore, getEffectiveVisibility } from '../store'
import MediaCard from './MediaCard'
import type { MediaFile } from '../types'

export default function MediaGrid() {
  const mediaFiles   = useStore(s => s.mediaFiles)
  const folders      = useStore(s => s.folders)
  const typeFilter   = useStore(s => s.typeFilter)
  const searchQuery  = useStore(s => s.searchQuery)
  const previewSpeed = useStore(s => s.previewSpeed)
  const openPlayer   = useStore(s => s.openPlayer)

  const visMap = useMemo(() => getEffectiveVisibility(folders), [folders])

  const visible: MediaFile[] = useMemo(() => {
    const now = Date.now()
    const ONE_DAY = 86_400_000
    const q = searchQuery.trim().toLowerCase()

    return mediaFiles.filter(f => {
      // search query
      if (q && !f.name.toLowerCase().includes(q)) return false

      // folder visibility
      if (!(visMap.get(f.folderId) ?? true)) return false

      // type filter
      if (typeFilter === 'video'  && f.mediaType !== 'video')  return false
      if (typeFilter === 'audio'  && f.mediaType !== 'audio')  return false
      if (typeFilter === 'recent' && now - f.addedAt > ONE_DAY) return false

      return true
    })
  }, [mediaFiles, visMap, typeFilter, searchQuery])

  if (mediaFiles.length === 0) return null

  return (
    <div className="grid">
      {visible.map(item => (
        <MediaCard
          key={item.id}
          item={item}
          previewSpeed={previewSpeed}
          onOpen={openPlayer}
        />
      ))}
    </div>
  )
}
