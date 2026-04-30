/**
 * Global video slot manager.
 *
 * At most MAX_ACTIVE video elements may hold a non-empty src at the same time.
 * When the limit is reached, the card that has been out-of-focus the longest
 * is evicted first (LRU by last-active timestamp).
 *
 * Usage:
 *   const release = VideoPool.acquire(cardId, evictCallback)
 *   // ... set video.src ...
 *   release()   // call when card leaves viewport or is unmounted
 */

const MAX_ACTIVE = 12

interface Slot {
  id: string
  lastActive: number
  evict: () => void
}

const slots = new Map<string, Slot>()

export const VideoPool = {
  /**
   * Try to acquire a slot for `id`.
   * If the pool is full, evict the least-recently-used slot first.
   * Returns a `release` function — call it when the card no longer needs the slot.
   */
  acquire(id: string, evict: () => void): () => void {
    // Already has a slot — just refresh timestamp
    if (slots.has(id)) {
      slots.get(id)!.lastActive = Date.now()
      slots.get(id)!.evict = evict
      return () => this.release(id)
    }

    // Evict LRU if full
    if (slots.size >= MAX_ACTIVE) {
      let oldest: Slot | null = null
      for (const s of slots.values()) {
        if (!oldest || s.lastActive < oldest.lastActive) oldest = s
      }
      if (oldest) {
        oldest.evict()
        slots.delete(oldest.id)
      }
    }

    slots.set(id, { id, lastActive: Date.now(), evict })
    return () => this.release(id)
  },

  /** Called when a card voluntarily gives up its slot (scroll out / unmount). */
  release(id: string) {
    slots.delete(id)
  },

  /** Refresh the "last active" time so this card isn't evicted soon. */
  touch(id: string) {
    const s = slots.get(id)
    if (s) s.lastActive = Date.now()
  },
}
