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
 * Aggressive keep-all strategy:
 * - src is set ONCE on mount and NEVER cleared — browser buffers all videos
 * - Only play/pause is toggled based on viewport visibility
 * - Viewport: real intersection (play) vs out-of-viewport (pause only)
 * - Hover: unmute + 1× speed; leave: mute + global speed
 *
 * Memory cost: ~2-8 MB per video in browser decode buffer.
 * With 100 videos × avg 4 MB = ~400 MB — acceptable on 24 GB RAM.
 * The browser's own media cache handles memory pressure automatically
 * by evicting buffers for paused out-of-viewport elements when needed.
 */
function MediaCard({ item, previewSpeed, onOpen }: Props) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const hoveredRef = useRef(false)
  const speedRef   = useRef(previewSpeed)

  const [inView,       setInView]       = useState(false)
  const [hovered,      setHovered]      = useState(false)
  // True once the video has decoded enough to display (fades over thumbnail)
  const [videoVisible, setVideoVisible] = useState(false)

  useEffect(() => { hoveredRef.current = hovered }, [hovered])
  useEffect(() => { speedRef.current   = previewSpeed }, [previewSpeed])

  /* ── Viewport observer — only controls play / pause ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.05 }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => io.disconnect()
  }, [item.mediaType])

  /* ── One-time setup: attach src and canplay listener on mount ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return
    const v = videoRef.current
    if (!v) return

    v.muted = true
    v.playbackRate = speedRef.current
    // preload="auto" tells the browser to start buffering immediately
    v.preload = 'auto'

    const onCanPlay = () => {
      setVideoVisible(true)
      // Only play if currently in viewport
      if (inViewRef.current) v.play().catch(() => {})
    }
    v.addEventListener('canplay', onCanPlay, { once: true })

    return () => {
      // On unmount just pause — don't clear src, browser GC handles it
      v.pause()
    }
  // Run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Need a ref copy for the one-time canplay handler above
  const inViewRef = useRef(false)
  useEffect(() => { inViewRef.current = inView }, [inView])

  /* ── Play / pause as card enters / leaves viewport ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || item.mediaType !== 'video') return

    if (inView) {
      v.muted = !hoveredRef.current
      v.playbackRate = hoveredRef.current ? 1 : speedRef.current
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [inView, item.mediaType])

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

  /* ── Global speed (only when not hovered) ── */
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

            {/* src set permanently — never cleared after mount */}
            <video
              ref={videoRef}
              className={`thumb-video ${videoVisible ? 'visible' : ''}`}
              src={item.url}
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
