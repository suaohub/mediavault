import { useEffect, useRef, useState, memo } from 'react'
import type { MediaFile } from '../types'
import { formatDuration, formatSize } from '../utils'

interface Props {
  item: MediaFile
  previewSpeed: number
  onOpen: (item: MediaFile) => void
}

/* ── Animated audio waveform ── */
const WBAR_DELAYS = [0, .15, .3, .45, .6, .45, .3, .15, 0]

function AudioVisual({ playing }: { playing: boolean }) {
  return (
    <div className="audio-bg">
      <span className="mus-note">♫</span>
      <div className="waves">
        {WBAR_DELAYS.map((d, i) => (
          <div key={i} className="wbar" style={{
            height: '42px',
            animationDelay: `${d}s`,
            animationPlayState: playing ? 'running' : 'paused',
          }} />
        ))}
      </div>
    </div>
  )
}

/* ── Volume icon ── */
function IcoVol({ muted }: { muted: boolean }) {
  return muted ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  )
}

const SEEK_SECS: Record<number, number> = { 1: 20, 1.5: 13, 2: 10, 3: 6.5, 4: 5 }

/**
 * Two-zone loading strategy:
 *
 *  ┌─────────────────────────────┐
 *  │  PRELOAD ZONE  (+200px top) │  ← src kept alive (preloaded / cached)
 *  ├─────────────────────────────┤
 *  │                             │
 *  │        VIEWPORT             │  ← playing + visible
 *  │                             │
 *  ├─────────────────────────────┤
 *  │  PRELOAD ZONE (+600px bot)  │  ← src preloaded, paused, ready to play
 *  └─────────────────────────────┘
 *
 * Cards inside the preload zone have their src set (network request made,
 * browser buffers frames) but are paused.  As soon as a card enters the
 * real viewport it starts playing.  When a card leaves the preload zone
 * the src is cleared after a short delay — this means the user has to
 * scroll at least ~200px past a card before it is evicted, eliminating
 * the "scroll up and it reloads" problem entirely.
 */
const PRELOAD_MARGIN = '200px 0px 600px 0px'

/** How long after leaving the preload zone before we actually clear src (ms).
 *  Extra safety net for fast back-scrolling. */
const UNLOAD_DELAY = 1200

function MediaCard({ item, previewSpeed, onOpen }: Props) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Refs for latest values — avoids stale closures in callbacks
  const hoveredRef   = useRef(false)
  const speedRef     = useRef(previewSpeed)
  const inZoneRef    = useRef(false)   // inside preload zone
  const inViewRef    = useRef(false)   // inside real viewport
  const unloadTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [inZone,       setInZone]       = useState(false)  // controls src
  const [inView,       setInView]       = useState(false)  // controls play/pause
  const [hovered,      setHovered]      = useState(false)
  const [srcActive,    setSrcActive]    = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)

  useEffect(() => { hoveredRef.current = hovered }, [hovered])
  useEffect(() => { speedRef.current   = previewSpeed }, [previewSpeed])
  useEffect(() => { inZoneRef.current  = inZone }, [inZone])
  useEffect(() => { inViewRef.current  = inView }, [inView])

  /* ── Observer 1: preload zone — controls src active ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (unloadTimer.current) { clearTimeout(unloadTimer.current); unloadTimer.current = null }
          setInZone(true)
        } else {
          // Delay unload — user might scroll back quickly
          unloadTimer.current = setTimeout(() => setInZone(false), UNLOAD_DELAY)
        }
      },
      { threshold: 0, rootMargin: PRELOAD_MARGIN }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => { io.disconnect(); clearTimeout(unloadTimer.current ?? undefined) }
  }, [item.mediaType])

  /* ── Observer 2: real viewport — controls play/pause ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.1 }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => io.disconnect()
  }, [item.mediaType])

  /* ── Activate / deactivate src based on zone ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    if (inZone) {
      setSrcActive(true)
    } else {
      const v = videoRef.current
      if (v) { v.pause(); v.src = ''; v.load() }
      setSrcActive(false)
      setVideoVisible(false)
    }
  }, [inZone, item.mediaType])

  /* ── Play / pause based on real viewport visibility ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return

    if (inView) {
      v.muted = !hoveredRef.current
      v.playbackRate = hoveredRef.current ? 1 : speedRef.current
      v.play().catch(() => {})
    } else {
      // Out of viewport but still in preload zone — keep src, just pause
      v.pause()
    }
  }, [inView, srcActive])

  /* ── Initial canplay handler (first time src is set) ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return

    v.muted = !hoveredRef.current
    v.playbackRate = hoveredRef.current ? 1 : speedRef.current

    const onCanPlay = () => {
      setVideoVisible(true)
      if (inViewRef.current) v.play().catch(() => {})
    }
    v.addEventListener('canplay', onCanPlay, { once: true })
    return () => v.removeEventListener('canplay', onCanPlay)
  }, [srcActive])

  /* ── Hover: unmute + 1× speed ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return
    if (hovered) {
      v.muted = false
      v.playbackRate = 1
    } else {
      v.muted = true
      v.playbackRate = speedRef.current
    }
  }, [hovered, srcActive])

  /* ── Global speed change (skip when hovered) ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive || hovered) return
    v.playbackRate = previewSpeed
  }, [previewSpeed, srcActive, hovered])

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      const v = videoRef.current
      if (v) { v.pause(); v.src = ''; v.load() }
      clearTimeout(unloadTimer.current ?? undefined)
    }
  }, [])

  const displaySpeed = hovered ? 1 : previewSpeed
  const seekDur      = SEEK_SECS[displaySpeed] ?? 6.5
  const isVideo      = item.mediaType === 'video'
  const playing      = inView && isVideo

  return (
    <div
      ref={cardRef}
      className={`card ${playing ? 'playing' : ''}`}
      style={{ '--seek': `${seekDur}s` } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(item)}
    >
      <div className={`thumb ${item.aspectClass}`}>
        {isVideo ? (
          <>
            {item.thumbnail
              ? <img
                  className="thumb-img"
                  src={item.thumbnail}
                  alt=""
                  style={{ opacity: videoVisible ? 0 : 1, transition: 'opacity .4s' }}
                />
              : <div className="thumb-placeholder" />
            }

            <video
              ref={videoRef}
              className={`thumb-video ${videoVisible ? 'visible' : ''}`}
              src={srcActive ? item.url : undefined}
              muted
              loop
              playsInline
              preload="auto"
            />

            <div className="thumb-ov"><div className="play-ring" /></div>
            <div className="vol-ind" title={hovered ? '播放声音中' : '悬停播放声音'}>
              <IcoVol muted={!hovered} />
            </div>
            <span className="spd-b">{displaySpeed}×</span>
            <div className="prog-bar"><div className="prog-fill" /></div>
          </>
        ) : (
          <>
            <AudioVisual playing={inView} />
            <div className="play-dot" />
          </>
        )}

        <span className={`badge ${isVideo ? 'bv' : 'ba'}`}>
          {isVideo ? 'Video' : 'Audio'}
        </span>
        {item.duration != null && (
          <span className="dur-b">{formatDuration(item.duration)}</span>
        )}
      </div>

      <div className="info">
        <div className="info-title" title={item.name}>{item.name}</div>
        <div className="info-meta">
          <span>{formatSize(item.size)}</span>
          {item.duration != null && <><span>·</span><span>{formatDuration(item.duration)}</span></>}
          {item.width && item.height && <><span>·</span><span>{item.width}×{item.height}</span></>}
        </div>
      </div>
    </div>
  )
}

export default memo(MediaCard)
