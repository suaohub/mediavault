import { useEffect, useRef, useState, memo } from 'react'
import type { MediaFile } from '../types'
import { formatDuration, formatSize } from '../utils'
import { VideoPool } from '../videoPool'

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

/** Minimum time a card must be in-view before we start loading (ms). */
const ENTER_DEBOUNCE = 120
/** Time card must be out-of-view before we begin the unload process (ms). */
const LEAVE_DEBOUNCE = 300
/** After LEAVE_DEBOUNCE, wait this long before actually clearing src (ms).
 *  Keeps the video alive for a brief moment in case the user scrolls back. */
const UNLOAD_DELAY   = 700

function MediaCard({ item, previewSpeed, onOpen }: Props) {
  const cardRef  = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const inViewRef      = useRef(false)
  const hoveredRef     = useRef(false)
  const speedRef       = useRef(previewSpeed)
  const releasePoolRef = useRef<(() => void) | null>(null)

  const enterTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [inView,       setInView]       = useState(false)
  const [hovered,      setHovered]      = useState(false)
  const [srcActive,    setSrcActive]    = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)

  useEffect(() => { inViewRef.current  = inView  }, [inView])
  useEffect(() => { hoveredRef.current = hovered }, [hovered])
  useEffect(() => { speedRef.current   = previewSpeed }, [previewSpeed])

  /* ── IntersectionObserver ── */
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (leaveTimerRef.current)  { clearTimeout(leaveTimerRef.current);  leaveTimerRef.current  = null }
          if (unloadTimerRef.current) { clearTimeout(unloadTimerRef.current); unloadTimerRef.current = null }

          enterTimerRef.current = setTimeout(() => setInView(true), ENTER_DEBOUNCE)
        } else {
          if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null }

          leaveTimerRef.current = setTimeout(() => setInView(false), LEAVE_DEBOUNCE)
        }
      },
      { threshold: 0.1 }
    )
    if (cardRef.current) io.observe(cardRef.current)
    return () => {
      io.disconnect()
      clearTimeout(enterTimerRef.current  ?? undefined)
      clearTimeout(leaveTimerRef.current  ?? undefined)
      clearTimeout(unloadTimerRef.current ?? undefined)
    }
  }, [])

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      unloadVideo()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Viewport enter / leave ── */
  useEffect(() => {
    if (item.mediaType !== 'video') return

    if (inView) {
      if (unloadTimerRef.current) { clearTimeout(unloadTimerRef.current); unloadTimerRef.current = null }

      // Acquire a slot from the global pool; if pool is full, another card is evicted.
      releasePoolRef.current = VideoPool.acquire(item.id, () => {
        // Eviction callback — pool forced us out (too many active cards)
        unloadVideo()
      })

      setSrcActive(true)
    } else {
      // Give up pool slot immediately so another card can get it
      releasePoolRef.current?.()
      releasePoolRef.current = null

      unloadTimerRef.current = setTimeout(unloadVideo, UNLOAD_DELAY)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, item.mediaType])

  function unloadVideo() {
    const v = videoRef.current
    if (v) {
      v.pause()
      v.src = ''
      v.load()
    }
    setSrcActive(false)
    setVideoVisible(false)
  }

  /* ── Touch pool when card is active (keeps it from being LRU-evicted) ── */
  useEffect(() => {
    if (!srcActive) return
    const t = setInterval(() => VideoPool.touch(item.id), 2000)
    return () => clearInterval(t)
  }, [srcActive, item.id])

  /* ── Start playback once src becomes active ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive) return

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

  /* ── Hover: unmute + drop to 1× ── */
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

  /* ── Global speed (skip when hovered) ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !srcActive || hovered) return
    v.playbackRate = previewSpeed
  }, [previewSpeed, srcActive, hovered])

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
