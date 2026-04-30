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
          <div
            key={i}
            className="wbar"
            style={{
              height: '42px',
              animationDelay: `${d}s`,
              animationPlayState: playing ? 'running' : 'paused',
            }}
          />
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

function MediaCard({ item, previewSpeed, onOpen }: Props) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Refs hold live values for use inside async event callbacks (avoid stale closures)
  const inViewRef  = useRef(false)
  const hoveredRef = useRef(false)
  const speedRef   = useRef(previewSpeed)

  const [inView,       setInView]       = useState(false)
  const [hovered,      setHovered]      = useState(false)
  /** true = src attribute is set, video is loading / playing */
  const [srcActive,    setSrcActive]    = useState(false)
  /** true = enough data to display, fade video over thumbnail */
  const [videoVisible, setVideoVisible] = useState(false)

  /* ── Keep refs in sync ── */
  useEffect(() => { inViewRef.current  = inView  }, [inView])
  useEffect(() => { hoveredRef.current = hovered }, [hovered])
  useEffect(() => { speedRef.current   = previewSpeed }, [previewSpeed])

  /* ── IntersectionObserver ── */
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.1 }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => io.disconnect()
  }, [])

  /* ── Viewport enter / leave ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    if (inView) {
      // Activate src → React will set src={item.url} on next render
      setSrcActive(true)
    } else {
      // ① pause immediately
      const v = videoRef.current
      if (v) {
        v.pause()
        // ② clear src — browser stops decode pipeline
        v.src = ''
        // ③ load() with empty src forces the browser to fully release
        //    all decoded frame buffers and network resources
        v.load()
      }
      // ④ reset state so thumbnail shows again
      setSrcActive(false)
      setVideoVisible(false)
    }
  }, [inView, item.mediaType])

  /* ── Start playback once src becomes active ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return

    // src is already set in the DOM at this point (React rendered first).
    // Configure and kick off playback; canplay will confirm data is ready.
    v.muted = !hoveredRef.current
    v.playbackRate = speedRef.current
    v.play().catch(() => {/* autoplay policy may block; canplay will retry */})

    const onCanPlay = () => {
      // Guard: card might have left viewport between src set and canplay
      if (!inViewRef.current) return
      setVideoVisible(true)
      // Retry play in case the initial call above was rejected
      v.play().catch(() => {})
    }

    v.addEventListener('canplay', onCanPlay, { once: true })
    return () => v.removeEventListener('canplay', onCanPlay)
  }, [srcActive])

  /* ── Hover: mute / unmute while in view ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return
    v.muted = !hovered
  }, [hovered, srcActive])

  /* ── Speed: update playback rate while in view ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return
    v.playbackRate = previewSpeed
  }, [previewSpeed, srcActive])

  const seekDur = SEEK_SECS[previewSpeed] ?? 6.5
  const isVideo = item.mediaType === 'video'
  const playing = inView && isVideo

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
            {/* Thumbnail — always present as fallback while video loads/unloads */}
            {item.thumbnail
              ? <img
                  className="thumb-img"
                  src={item.thumbnail}
                  alt=""
                  style={{ opacity: videoVisible ? 0 : 1, transition: 'opacity .4s' }}
                />
              : <div className="thumb-placeholder" />
            }

            {/* Video element — src is only set when card is in viewport.
                Clearing src + calling load() releases decoded frame buffers. */}
            <video
              ref={videoRef}
              className={`thumb-video ${videoVisible ? 'visible' : ''}`}
              src={srcActive ? item.url : undefined}
              muted   /* React attribute; actual mute toggled via ref imperatively */
              loop
              playsInline
              preload="none"
            />

            <div className="thumb-ov"><div className="play-ring" /></div>
            <div className="vol-ind" title={hovered ? '播放声音中' : '悬停播放声音'}>
              <IcoVol muted={!hovered} />
            </div>
            <span className="spd-b">{previewSpeed}×</span>
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
