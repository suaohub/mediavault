import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'
import { formatDuration } from '../utils'

const SPEEDS = [0.5, 1, 1.5, 2, 3, 4]
const WBAR_DELAYS = [0, .12, .24, .36, .48, .6, .48, .36, .24, .12, 0]

/* ── Audio background ── */
function AudioFullBg({ name }: { name: string }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(135deg,#18082e 0%,#2d1058 50%,#381058 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
    }}>
      <div style={{ fontSize: 72, opacity: .5 }}>♫</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 60 }}>
        {WBAR_DELAYS.map((d, i) => (
          <div key={i} className="wbar" style={{
            height: '60px', background: 'rgba(168,85,247,.65)',
            animationDelay: `${d}s`, animationPlayState: 'running',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,.75)', maxWidth: 480, textAlign: 'center', padding: '0 24px' }}>
        {name}
      </div>
    </div>
  )
}

/* ── Icons ── */
const IcoPrev  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
const IcoNext  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
const IcoPause = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
const IcoPlay  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
const IcoClose = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IcoFull  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
const IcoSpd   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>

function IcoVol({ vol }: { vol: number }) {
  if (vol === 0) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  )
  if (vol < 0.5) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  )
}

/** Seek via fastSeek() if available (snaps to keyframe, much faster),
 *  otherwise fall back to precise currentTime assignment. */
function seekVideo(v: HTMLVideoElement, t: number) {
  const clamped = Math.max(0, Math.min(v.duration || Infinity, t))
  if (typeof (v as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek === 'function') {
    (v as HTMLVideoElement & { fastSeek: (t: number) => void }).fastSeek(clamped)
  } else {
    v.currentTime = clamped
  }
}

export default function PlayerModal() {
  const item        = useStore(s => s.currentPlayer)
  const closePlayer = useStore(s => s.closePlayer)

  const videoRef  = useRef<HTMLVideoElement>(null)
  const rafRef    = useRef<number>(0)
  const hideTimer = useRef<number>(0)
  const isPlayRef = useRef(true)

  // Refs for keyboard handler (avoid stale closures without re-adding listeners)
  const volumeRef = useRef(1.0)
  const durRef    = useRef(0)

  const [playing,   setPlaying]   = useState(true)
  const [current,   setCurrent]   = useState(0)
  const [dur,       setDur]       = useState(0)
  const [volume,    setVolume]    = useState(1.0) // default 1.0 → full system volume
  const [speed,     setSpeed]     = useState(1)
  const [showSpd,   setShowSpd]   = useState(false)
  const [showCtrls, setShowCtrls] = useState(true)
  const [seeking,   setSeeking]   = useState(false) // true while browser is decoding seek
  const [dragging,  setDragging]  = useState(false) // true while user drags progress bar
  const [dragPct,   setDragPct]   = useState(0)     // 0-1, visual-only during drag

  const isOpen  = item !== null
  const isVideo = item?.mediaType === 'video'

  // Keep refs in sync with state
  useEffect(() => { volumeRef.current = volume }, [volume])
  useEffect(() => { durRef.current    = dur    }, [dur])

  /* ── Show controls + reset auto-hide timer ── */
  const revealCtrls = useCallback(() => {
    setShowCtrls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (isPlayRef.current) setShowCtrls(false)
    }, 3000)
  }, [])

  /* ── Mount video ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !item || !isVideo) return

    v.src    = item.url
    v.volume = volumeRef.current
    v.playbackRate = speed
    setPlaying(true)
    isPlayRef.current = true
    setSeeking(false)
    v.play().catch(() => { setPlaying(false); isPlayRef.current = false })

    const onMeta    = () => { setDur(v.duration); durRef.current = v.duration }
    const onEnded   = () => { setPlaying(false); isPlayRef.current = false; setShowCtrls(true) }
    const onSeeking = () => setSeeking(true)
    const onSeeked  = () => setSeeking(false)

    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('ended',          onEnded)
    v.addEventListener('seeking',        onSeeking)
    v.addEventListener('seeked',         onSeeked)

    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('ended',          onEnded)
      v.removeEventListener('seeking',        onSeeking)
      v.removeEventListener('seeked',         onSeeked)
      v.pause(); v.src = ''
      cancelAnimationFrame(rafRef.current)
      clearTimeout(hideTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  /* ── Progress rAF (only update current time when not dragging) ── */
  useEffect(() => {
    const v = videoRef.current
    if (!v || !isVideo) return
    const tick = () => {
      if (!dragging) setCurrent(v.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    if (playing) { rafRef.current = requestAnimationFrame(tick) }
    else { cancelAnimationFrame(rafRef.current) }
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, isVideo, dragging])

  /* ── Keyboard: arrow keys = seek/vol, any other key = close ── */
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (v) { seekVideo(v, v.currentTime - 5); revealCtrls() }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (v) { seekVideo(v, v.currentTime + 5); revealCtrls() }
          break
        case 'ArrowUp':
          e.preventDefault()
          applyVol(Math.min(1, volumeRef.current + 0.1))
          revealCtrls()
          break
        case 'ArrowDown':
          e.preventDefault()
          applyVol(Math.max(0, volumeRef.current - 0.1))
          revealCtrls()
          break
        default:
          closePlayer()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // deps: only isOpen — volume/dur accessed via refs, no stale closures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  /* ── Auto-show controls when modal opens ── */
  useEffect(() => {
    if (isOpen) {
      setShowCtrls(true)
      setSpeed(1)
      setCurrent(0)
      setDur(0)
      setSeeking(false)
      setDragging(false)
      clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => {
        if (isPlayRef.current) setShowCtrls(false)
      }, 3000)
    }
  }, [isOpen])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (playing) { v.pause(); setPlaying(false); isPlayRef.current = false; setShowCtrls(true) }
    else         { v.play().catch(() => {}); setPlaying(true); isPlayRef.current = true; revealCtrls() }
  }, [playing, revealCtrls])

  /** Apply volume to both state and video element */
  const applyVol = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val))
    setVolume(clamped)
    volumeRef.current = clamped
    const v = videoRef.current
    if (v) v.volume = clamped
  }

  /* ── Drag-to-seek on the progress bar ─────────────────────────────
     During drag: only the visual bar moves (no actual seek).
     On mouseup: one single seek to the final position.
     This eliminates the repeated decode-lag from tracking every pixel.
  ──────────────────────────────────────────────────────────────────── */
  const onTrackMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dur) return
    e.preventDefault()
    e.stopPropagation()

    const rect = e.currentTarget.getBoundingClientRect()
    const clamp = (x: number) => Math.max(0, Math.min(1, (x - rect.left) / rect.width))

    const init = clamp(e.clientX)
    setDragging(true)
    setDragPct(init)

    const onMove = (me: MouseEvent) => setDragPct(clamp(me.clientX))

    const onUp = (me: MouseEvent) => {
      const pct = clamp(me.clientX)
      const v = videoRef.current
      if (v && durRef.current > 0) {
        // Seek once on release — single decode operation
        v.currentTime = pct * durRef.current
        setCurrent(pct * durRef.current)
      }
      setDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [dur])

  const handleVolClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    applyVol((e.clientX - rect.left) / rect.width)
  }

  const pickSpeed = (s: number) => {
    setSpeed(s); setShowSpd(false)
    if (videoRef.current) videoRef.current.playbackRate = s
  }

  const enterFull = () => videoRef.current?.requestFullscreen?.()

  // Display percentage: use dragPct during drag, otherwise real currentTime
  const displayPct = dragging ? dragPct * 100 : (dur > 0 ? (current / dur) * 100 : 0)
  const displayTime = dragging ? dragPct * dur : current

  return (
    <div
      className={`pm ${isOpen ? 'open' : ''} ${isOpen && !showCtrls ? 'pm-hide-cursor' : ''}`}
      onMouseMove={revealCtrls}
    >
      {isOpen && item && (
        <>
          {/* ── Full-screen media ── */}
          <div className="pm-fill" onClick={isVideo ? togglePlay : undefined}>
            {isVideo
              ? <video ref={videoRef} loop playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: 'inherit' }} />
              : <AudioFullBg name={item.name} />
            }
            {/* Buffering indicator: shown while browser decodes after seek */}
            {seeking && isVideo && <div className="pm-buffering" />}
          </div>

          {/* ── Overlay ── */}
          <div className={`pm-overlay ${showCtrls || !playing ? 'show' : ''}`}>

            {/* Top bar */}
            <div className="pm-topbar">
              <button className="pm-close-btn" onClick={closePlayer}><IcoClose /></button>
              <span className="pm-title-top">{item.name}</span>
            </div>

            {/* Bottom bar */}
            <div className="pm-bottombar">
              {/* Progress bar — drag-to-seek */}
              {isVideo && (
                <div className="pm-prog-row">
                  <span>{formatDuration(displayTime)}</span>
                  <div
                    className={`pm-track ${dragging ? 'pm-track-drag' : ''}`}
                    onMouseDown={onTrackMouseDown}
                  >
                    <div className="pm-prog" style={{ width: `${displayPct}%` }} />
                    {/* Drag handle thumb */}
                    <div
                      className="pm-thumb"
                      style={{ left: `${displayPct}%`, opacity: dragging ? 1 : undefined }}
                    />
                  </div>
                  <span>{formatDuration(dur)}</span>
                </div>
              )}

              {/* Controls */}
              <div className="pm-ctrlrow">
                <button className="pmb" onClick={e => e.stopPropagation()}><IcoPrev /></button>
                <button className="pmb pmb-lg" onClick={e => { e.stopPropagation(); togglePlay() }}>
                  {playing ? <IcoPause /> : <IcoPlay />}
                </button>
                <button className="pmb" onClick={e => e.stopPropagation()}><IcoNext /></button>

                <div className="pm-extras">
                  {/* Speed */}
                  {isVideo && (
                    <div className="pspd-wrap" onClick={e => e.stopPropagation()}>
                      <div className="pspd-btn" onClick={() => setShowSpd(s => !s)}>
                        <IcoSpd />{speed}×
                      </div>
                      {showSpd && (
                        <div className="pspd-pop">
                          {SPEEDS.map(s => (
                            <div key={s} className={`psopt ${speed === s ? 'on' : ''}`} onClick={() => pickSpeed(s)}>{s}×</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Volume — controls app volume, layered on system volume */}
                  <div
                    className="pm-vol"
                    onClick={e => e.stopPropagation()}
                    title="应用音量（叠加在系统音量之上）"
                  >
                    <span
                      style={{ cursor: 'pointer' }}
                      onClick={() => applyVol(volume === 0 ? 1 : 0)}
                    >
                      <IcoVol vol={volume} />
                    </span>
                    <div className="pm-vt" onClick={handleVolClick}>
                      <div className="pm-vf" style={{ width: `${volume * 100}%` }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', minWidth: 28, userSelect: 'none' }}>
                      {Math.round(volume * 100)}%
                    </span>
                  </div>

                  {/* Fullscreen */}
                  {isVideo && (
                    <button className="pmb" onClick={e => { e.stopPropagation(); enterFull() }}><IcoFull /></button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
