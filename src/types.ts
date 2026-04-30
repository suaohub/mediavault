export type MediaType = 'video' | 'audio'
export type TypeFilter = 'all' | 'video' | 'audio' | 'recent'
export type AspectClass = 'r16x9' | 'r4x3' | 'r9x16' | 'r1x1' | 'r21x9'

export interface MediaFile {
  id: string
  name: string
  mediaType: MediaType
  file: File
  /** blob URL — stays alive for the session */
  url: string
  /** base64 JPEG, null until generated */
  thumbnail: string | null
  duration: number | null
  width: number | null
  height: number | null
  aspectClass: AspectClass
  size: number
  /** folder path id, e.g. "Travel/Europe" or "__root__" */
  folderId: string
  addedAt: number
}

export interface FolderNode {
  /** path-based, e.g. "Travel" or "Travel/Europe" */
  id: string
  name: string
  parentId: string | null
  visible: boolean
  children: FolderNode[]
}
