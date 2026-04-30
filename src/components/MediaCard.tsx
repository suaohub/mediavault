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

/** How long to stay "active" after leaving the viewport before unloading (ms).
 *  Prevents rapid load/unload when the user scrolls slowly past a card. */
const UNLOAD_DELAY = 800

/** How long to wait after an IntersectionObserver change before acting (ms).
 *  Prevents reacting to momentary scroll bounces. */
const ENTER_DEBOUNCE  = 120
const LEAVE_DEBOUNCE  = 300

function MediaCard({ item, previewSpeed, onOpen }: Props) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Refs hold live values for use inside async callbacks (avoid stale closures)
  const inViewRef      = useRef(false)
  const hoveredRef     = useRef(false)
  const speedRef       = useRef(previewSpeed)
  const enterTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [inView,       setInView]       = useState(false)
  const [hovered,      setHovered]      = useState(false)
  const [srcActive,    setSrcActive]    = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)

  /* ── Keep refs in sync ── */
  useEffect(() => { inViewRef.current  = inView  }, [inView])
  useEffect(() => { hoveredRef.current = hovered }, [hovered])
  useEffect(() => { speedRef.current   = previewSpeed }, [previewSpeed])

  /* ── IntersectionObserver with debounce ── */
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        const entering = e.isIntersecting

        if (entering) {
          // Cancel any pending leave / unload timers
          if (leaveTimerRef.current)  { clearTimeout(leaveTimerRef.current);  leaveTimerRef.current  = null }
          if (unloadTimerRef.current) { clearTimeout(unloadTimerRef.current); unloadTimerRef.current = null }

          // Short debounce so a quick scroll-through doesn't trigger load
          enterTimerRef.current = setTimeout(() => {
            setInView(true)
          }, ENTER_DEBOUNCE)
        } else {
          // Cancel pending enter timer (card left before debounce fired)
          if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null }

          // Debounce the leave so small scroll jitter doesn't unload immediately
          leaveTimerRef.current = setTimeout(() => {
            setInView(false)
          }, LEAVE_DEBOUNCE)
        }
      },
      { threshold: 0.1 }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => {
      io.disconnect()
      if (enterTimerRef.current)  clearTimeout(enterTimerRef.current)
      if (leaveTimerRef.current)  clearTimeout(leaveTimerRef.current)
      if (unloadTimerRef.current) clearTimeout(unloadTimerRef.current)
    }
  }, [])

  /* ── Viewport enter / leave ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    if (inView) {
      // Cancel any pending unload
      if (unloadTimerRef.current) { clearTimeout(unloadTimerRef.current); unloadTimerRef.current = null }
      setSrcActive(true)
    } else {
      // Delay unloading so upward scroll doesn't cause flicker when user scrolls back
      unloadTimerRef.current = setTimeout(() => {
        const v = videoRef.current
        if (v) {
          v.pause()
          v.src = ''
          v.load()
        }
        setSrcActive(false)
        setVideoVisible(false)
      }, UNLOAD_DELAY)
    }
  }, [inView, item.mediaType])

  /* ── Start playback once src becomes active ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return

    // Hovering → 1× speed; otherwise use global preview speed
    v.muted = !hoveredRef.current
    v.playbackRate = hoveredRef.current ? 1 : speedRef.current
    v.play().catch(() => {})

    const onCanPlay = () => {
      if (!inViewRef.current) return
      setVideoVisible(true)
      v.play().catch(() => {})
    }
    v.addEventListener('canplay', onCanPlay, { once: true })
    return () => v.removeEventListener('canplay', onCanPlay)
  }, [srcActive])

  /* ── Hover enter: unmute + drop to 1× speed ── */
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

  /* ── Global speed change (only applies when not hovered) ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive || hovered) return
    v.playbackRate = previewSpeed
  }, [previewSpeed, srcActive, hovered])

  // When hovered, always show 1× in the badge; otherwise show global speed
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
              preload="none"
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
