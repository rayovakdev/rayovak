import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getSession,
  confirmEvent,
  bulkConfirmEvents,
  type SessionDetail,
  type TicEventRecord,
} from '../api/sessions'

function formatDuration(started: string, completed: string | null): string {
  if (!completed) return '—'
  const secs = Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function severityColor(score: number): string {
  if (score < 30) return 'text-green-600'
  if (score < 70) return 'text-yellow-600'
  return 'text-red-600'
}

function ticTypeColor(type: string): string {
  switch (type) {
    case 'mouth': return 'bg-purple-100 text-purple-700'
    case 'hand': return 'bg-blue-100 text-blue-700'
    case 'face': return 'bg-orange-100 text-orange-700'
    case 'manual': return 'bg-yellow-100 text-yellow-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

interface EventState {
  status: 'pending' | 'confirmed' | 'rejected'
  annotation: string
}

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [eventStates, setEventStates] = useState<Record<number, EventState>>({})
  const [savingIdx, setSavingIdx] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeEventIdx, setActiveEventIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!sessionId) return
    getSession(sessionId)
      .then(setSession)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => {
    if (!session) return
    const initial: Record<number, EventState> = {}
    session.events.forEach((evt, i) => {
      if (evt.confirmation) {
        initial[i] = { status: evt.confirmation, annotation: evt.annotation }
      }
    })
    setEventStates(initial)
  }, [session])

  async function setEventStatus(idx: number, status: 'confirmed' | 'rejected') {
    const annotation = eventStates[idx]?.annotation ?? ''
    setSavingIdx(idx)
    setSaveError(null)
    try {
      await confirmEvent(sessionId!, idx, status, annotation)
      setEventStates((prev) => {
        const existing: EventState = prev[idx] ?? { status: 'pending', annotation: '' }
        return { ...prev, [idx]: { ...existing, status } }
      })
    } catch (e) {
      console.error('Failed to save confirmation:', e)
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingIdx(null)
    }
  }

  function setAnnotation(idx: number, annotation: string) {
    setEventStates((prev) => {
      const existing: EventState = prev[idx] ?? { status: 'pending', annotation: '' }
      return { ...prev, [idx]: { ...existing, annotation } }
    })
  }

  async function handleBulkConfirm(status: 'confirmed' | 'rejected') {
    if (!session) return
    const pending = session.events
      .map((_, i) => i)
      .filter((i) => !eventStates[i] || eventStates[i].status === 'pending')
    if (pending.length === 0) return
    setBulkError(null)
    try {
      await bulkConfirmEvents(sessionId!, pending.map((i) => ({ event_index: i, status })))
      setEventStates((prev) => {
        const next = { ...prev }
        for (const i of pending) {
          next[i] = { status, annotation: prev[i]?.annotation ?? '' }
        }
        return next
      })
    } catch (e) {
      console.error('Failed to bulk confirm:', e)
      setBulkError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  function seekToEvent(idx: number) {
    if (!session) return
    const event = session.events[idx]
    const offsetSeconds =
      (new Date(event.timestamp).getTime() - new Date(session.started_at).getTime()) / 1000
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, offsetSeconds)
      videoRef.current.play().catch(() => {})
    }
    setActiveEventIdx(idx)
  }

  if (loading) return <div className="text-sm text-gray-500">Loading...</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>
  if (!session) return null

  const isCompleted = session.status === 'completed'
  const durationMs = session.completed_at
    ? new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()
    : 0

  const selectedEvent: TicEventRecord | null = selected !== null ? session.events[selected] : null
  const selectedState: EventState | undefined = selected !== null ? eventStates[selected] : undefined

  return (
    <div>
      <button onClick={() => navigate('/history')} className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to Session History
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Detail</h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Date(session.started_at).toLocaleString()} · {formatDuration(session.started_at, session.completed_at)} · {session.events.length} events
          </p>
        </div>
        {session.severity_score != null && (
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Severity</div>
            <div className={`text-4xl font-bold ${severityColor(session.severity_score)}`}>
              {session.severity_score.toFixed(1)}
            </div>
          </div>
        )}
      </div>

      {session.severity_detail && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(['frequency_score', 'intensity_score', 'repetitiveness_score', 'variety_score'] as const).map((key) => (
            <div key={key} className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 capitalize">{key.replace('_score', '')}</div>
              <div className="text-xl font-semibold text-gray-800 mt-1">
                {session.severity_detail![key].toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      )}

      {session.severity_detail?.region_scores && (
        <div className="mt-4 grid grid-cols-4 gap-3">
          {(Object.entries(session.severity_detail.region_scores) as [string, number][]).map(([region, score]) => (
            <div key={region} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 capitalize">{region}</div>
              <div className="text-lg font-semibold text-gray-700 mt-1">{score.toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}

      {session.has_video && (
        <div className="mt-6">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Video</div>
          <video
            ref={videoRef}
            src={`${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}/api/v1/video_analysis/sessions/${session.session_id}/video`}
            controls
            className="w-full rounded-lg border border-gray-200 bg-black max-h-80"
          />
        </div>
      )}

      {durationMs > 0 && session.events.length > 0 && (
        <div className="mt-6">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Timeline</div>
          <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
            {session.events.map((evt, i) => {
              const pct = ((new Date(evt.timestamp).getTime() - new Date(session.started_at).getTime()) / durationMs) * 100
              const state = eventStates[i]
              const color = state?.status === 'confirmed' ? 'bg-green-500' : state?.status === 'rejected' ? 'bg-gray-400' : 'bg-indigo-500'
              return (
                <button
                  key={i}
                  onClick={() => setSelected(i === selected ? null : i)}
                  style={{ left: `${Math.min(pct, 98)}%` }}
                  className={`absolute top-1 h-6 w-2 rounded-sm ${color} hover:opacity-80 transition-opacity ${selected === i ? 'ring-2 ring-offset-1 ring-indigo-400' : ''}`}
                  title={`${evt.tic_type} @ ${new Date(evt.timestamp).toISOString().slice(11, 23)}`}
                />
              )
            })}
          </div>
        </div>
      )}

      {selectedEvent && isCompleted && (
        <div className="mt-4 border border-indigo-200 rounded-lg p-4 bg-indigo-50">
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ticTypeColor(selectedEvent.tic_type)}`}>
              {selectedEvent.tic_type}
            </span>
            <span className="text-xs text-gray-500">{new Date(selectedEvent.timestamp).toISOString().slice(11, 23)}</span>
          </div>
          <div className="text-sm mb-3">
            <span className="text-gray-500">Confidence:</span>{' '}
            <span className="font-medium">{(selectedEvent.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="flex gap-2 mb-3 items-center">
            <button
              onClick={() => void setEventStatus(selected!, 'confirmed')}
              disabled={savingIdx === selected}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${selectedState?.status === 'confirmed' ? 'bg-green-600 text-white' : 'bg-white border border-green-600 text-green-600 hover:bg-green-50'}`}
            >
              {savingIdx === selected ? 'Saving…' : selectedState?.status === 'confirmed' ? '✓ Confirmed' : 'Confirm'}
            </button>
            <button
              onClick={() => void setEventStatus(selected!, 'rejected')}
              disabled={savingIdx === selected}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${selectedState?.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-white border border-red-600 text-red-600 hover:bg-red-50'}`}
            >
              {savingIdx === selected ? 'Saving…' : selectedState?.status === 'rejected' ? '✗ Rejected' : 'Reject'}
            </button>
            {saveError && <span className="text-xs text-red-500">{saveError}</span>}
          </div>
          <input
            type="text"
            placeholder="Add annotation..."
            value={selectedState?.annotation ?? ''}
            onChange={(e) => setAnnotation(selected!, e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Events ({session.events.length})
            {isCompleted && session.events.length > 0 && (
              <span className="ml-2 normal-case text-gray-400">
                · {session.confirmed_count} confirmed · {session.rejected_count} rejected
              </span>
            )}
          </div>
          {isCompleted && session.events.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                <button
                  onClick={() => void handleBulkConfirm('confirmed')}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-300 hover:bg-green-100 transition-colors"
                >
                  Confirm All Pending
                </button>
                <button
                  onClick={() => void handleBulkConfirm('rejected')}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 transition-colors"
                >
                  Reject All Pending
                </button>
              </div>
              {bulkError && <p className="text-xs text-red-500">{bulkError}</p>}
            </div>
          )}
        </div>
        {!isCompleted && session.events.length > 0 && (
          <p className="text-xs text-gray-400 mb-2">Complete the session to review and confirm events.</p>
        )}
        {session.events.length === 0 ? (
          <p className="text-sm text-gray-500">No events recorded.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-2 pr-4">Time</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Confidence</th>
                <th className="pb-2 pr-4">Status</th>
                {session.has_video && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody>
              {session.events.map((evt, i) => {
                const state = eventStates[i]
                return (
                  <tr
                    key={i}
                    onClick={() => setSelected(i === selected ? null : i)}
                    className={`border-b border-gray-100 cursor-pointer ${selected === i ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="py-2 pr-4 font-mono text-xs text-gray-600">
                      {new Date(evt.timestamp).toISOString().slice(11, 23)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ticTypeColor(evt.tic_type)}`}>
                        {evt.tic_type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{(evt.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4">
                      {state?.status === 'confirmed' && <span className="text-xs text-green-600 font-medium">✓ Confirmed</span>}
                      {state?.status === 'rejected' && <span className="text-xs text-red-500 font-medium">✗ Rejected</span>}
                      {(!state || state.status === 'pending') && <span className="text-xs text-gray-400">Pending</span>}
                    </td>
                    {session.has_video && (
                      <td className="py-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); seekToEvent(i) }}
                          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${activeEventIdx === i ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
                          title="Seek video to this event"
                        >
                          ▶
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
