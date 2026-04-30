import { useStore } from '../store'
import { formatDuration } from '../utils'

const IcoPrev  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
const IcoNext  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
const IcoPlay  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
const IcoVol   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
const IcoUp    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>

export default function MiniPlayer() {
  const currentPlayer = useStore(s => s.currentPlayer)
  const openPlayer    = useStore(s => s.openPlayer)

  return (
    <div className="mplayer">
      {currentPlayer ? (
        <>
          {/* Thumbnail */}
          {currentPlayer.thumbnail
            ? <img className="np-thumb" src={currentPlayer.thumbnail} alt="" />
            : <div className="np-thumb-ph" />
          }

          {/* Info */}
          <div className="np-info">
            <div className="np-title">{currentPlayer.name}</div>
            <div className="np-sub">{formatDuration(currentPlayer.duration ?? 0)}</div>
          </div>

          {/* Controls */}
          <div className="mp-ctrls">
            <button className="mc"><IcoPrev /></button>
            <button className="mc main"><IcoPlay /></button>
            <button className="mc"><IcoNext /></button>
          </div>

          {/* Progress */}
          <div className="mp-prog">
            <span>00:00</span>
            <div className="mp-track">
              <div className="mp-fill" style={{ width: '0%' }} />
            </div>
            <span>{formatDuration(currentPlayer.duration ?? 0)}</span>
          </div>

          {/* Volume */}
          <div className="mp-vol">
            <IcoVol />
            <div className="mvt"><div className="mvf" /></div>
          </div>

          {/* Open fullscreen */}
          <button className="mc" style={{ marginLeft: 6 }} onClick={() => openPlayer(currentPlayer)}>
            <IcoUp />
          </button>
        </>
      ) : (
        <div style={{ color: 'var(--mu)', fontSize: 12, margin: '0 auto' }}>
          点击视频卡片开始播放
        </div>
      )}
    </div>
  )
}
