import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSessions, type SessionSummary } from '../api/sessions'

function severityBadge(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-500'
  if (score < 30) return 'bg-green-100 text-green-700'
  if (score < 70) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

function formatDuration(started: string, completed: string | null): string {
  if (!completed) return '—'
  const secs = Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

type SortKey = 'date-desc' | 'date-asc' | 'score-desc' | 'score-asc'

export default function SessionHistory() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minScore, setMinScore] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('date-desc')

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = [...sessions]
    if (startDate) result = result.filter((s) => s.started_at >= startDate)
    if (endDate) result = result.filter((s) => s.started_at <= endDate + 'T23:59:59')
    if (minScore !== '')
      result = result.filter(
        (s) => s.severity_score != null && s.severity_score >= Number(minScore),
      )
    if (maxScore !== '')
      result = result.filter(
        (s) => s.severity_score != null && s.severity_score <= Number(maxScore),
      )
    result.sort((a, b) => {
      if (sortBy === 'date-desc')
        return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      if (sortBy === 'date-asc')
        return new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      if (sortBy === 'score-desc') return (b.severity_score ?? -1) - (a.severity_score ?? -1)
      return (a.severity_score ?? -1) - (b.severity_score ?? -1)
    })
    return result
  }, [sessions, startDate, endDate, minScore, maxScore, sortBy])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Session History</h1>
      <p className="mt-1 text-sm text-gray-500">Past monitoring sessions with severity scores.</p>

      <div className="mt-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Min score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="0"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Max score</label>
          <input
            type="number"
            min={0}
            max={100}
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            placeholder="100"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="date-desc">Date (newest)</option>
            <option value="date-asc">Date (oldest)</option>
            <option value="score-desc">Severity (high first)</option>
            <option value="score-asc">Severity (low first)</option>
          </select>
        </div>
      </div>

      <div className="mt-6">
        {loading && <p className="text-sm text-gray-500">Loading...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-gray-500">No sessions found.</p>
        )}
        {!loading && !error && filtered.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-2 pr-4">Date / Time</th>
                <th className="pb-2 pr-4">Duration</th>
                <th className="pb-2 pr-4">Severity</th>
                <th className="pb-2">Events</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.session_id}
                  onClick={() => navigate(`/sessions/${s.session_id}`)}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="py-3 pr-4 text-gray-700">
                    {new Date(s.started_at).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">
                    {formatDuration(s.started_at, s.completed_at)}
                  </td>
                  <td className="py-3 pr-4">
                    {s.severity_score != null ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityBadge(s.severity_score)}`}
                      >
                        {s.severity_score.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 text-gray-600">{s.event_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
