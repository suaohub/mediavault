import { useEffect, useRef, useState, memo } from 'react'
import type { MediaFile } from '../types'
import { formatDuration, formatSize } from '../utils'

interface Props {
  item: MediaFile
  previewSpeed: number
  onOpen: (item: MediaFile) => void
}

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
 * Three-state loading strategy:
 *
 *  IDLE      — src not set, no network activity, shows thumbnail
 *  WARM      — src set, preload="metadata" (reads header only, ~10-50 KB)
 *              enters this state when card is within the preload margin
 *  HOT       — preload="auto", playing when in viewport
 *              enters this state the first time the card enters the real viewport
 *              NEVER goes back to IDLE or WARM — src stays set forever
 *
 * This means:
 *  - All 100+ videos don't compete for the decoder on mount
 *  - Cards near the viewport preload just enough to know dimensions/duration
 *  - Once a card has been seen (HOT), it stays buffered — no reload on scroll back
 *  - Cards far off-screen remain IDLE and cost nothing
 */
type LoadState = 'idle' | 'warm' | 'hot'

// How far outside the viewport to start warming (preload metadata)
const WARM_MARGIN = '400px 0px 800px 0px'

function MediaCard({ item, previewSpeed, onOpen }: Props) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const hoveredRef  = useRef(false)
  const speedRef    = useRef(previewSpeed)
  const inViewRef   = useRef(false)

  const [loadState,    setLoadState]    = useState<LoadState>('idle')
  const [inView,       setInView]       = useState(false)
  const [hovered,      setHovered]      = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)

  useEffect(() => { hoveredRef.current = hovered }, [hovered])
  useEffect(() => { speedRef.current   = previewSpeed }, [previewSpeed])
  useEffect(() => { inViewRef.current  = inView }, [inView])

  /* ── Observer 1: warm zone — sets src with preload=metadata ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          // Transition idle → warm (warm → hot is one-way, handled below)
          setLoadState(s => s === 'idle' ? 'warm' : s)
        }
        // No downgrade on leave — once warm/hot, stays that way
      },
      { threshold: 0, rootMargin: WARM_MARGIN }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => io.disconnect()
  }, [item.mediaType])

  /* ── Observer 2: real viewport — play/pause + upgrade to hot ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting)
        if (e.isIntersecting) {
          // First time entering viewport → upgrade to hot (full buffering)
          setLoadState(s => s !== 'hot' ? 'hot' : s)
        }
      },
      { threshold: 0.05 }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => io.disconnect()
  }, [item.mediaType])

  /* ── Apply preload attribute when loadState changes ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || loadState === 'idle') return
    v.preload = loadState === 'hot' ? 'auto' : 'metadata'
  }, [loadState])

  /* ── canplay: show video overlay once decoded ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || loadState === 'idle') return

    const onCanPlay = () => {
      setVideoVisible(true)
      if (inViewRef.current) {
        v.muted = !hoveredRef.current
        v.playbackRate = hoveredRef.current ? 1 : speedRef.current
        v.play().catch(() => {})
      }
    }
    v.addEventListener('canplay', onCanPlay, { once: true })
    return () => v.removeEventListener('canplay', onCanPlay)
  // Re-attach when transitioning from warm → hot (new canplay may fire)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState])

  /* ── Play / pause as viewport changes ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || loadState !== 'hot') return

    if (inView) {
      v.muted = !hoveredRef.current
      v.playbackRate = hoveredRef.current ? 1 : speedRef.current
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [inView, loadState])

  /* ── Hover: unmute + 1× ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (hovered) {
      v.muted = false
      v.playbackRate = 1
    } else {
      v.muted = true
      v.playbackRate = speedRef.current
    }
  }, [hovered])

  /* ── Global speed (skip when hovered) ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || hovered) return
    v.playbackRate = previewSpeed
  }, [previewSpeed, hovered])

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
              // src only set once loadState leaves idle — controls decode pressure
              src={loadState !== 'idle' ? item.url : undefined}
              muted
              loop
              playsInline
              preload="metadata"
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
