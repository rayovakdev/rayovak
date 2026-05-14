import { useEffect, useRef, useState } from 'react'
import { listSessions } from '../api/sessions'
import type { SessionSummary } from '../api/sessions'

type DayRange = 7 | 30 | 90

type HealthOverlay = 'heart_rate' | 'sleep' | 'steps'

const CHART_W = 600
const CHART_H = 200
const PAD = { top: 16, right: 16, bottom: 32, left: 40 }

function severityColor(score: number): string {
  if (score < 30) return '#22c55e'
  if (score < 60) return '#f59e0b'
  return '#ef4444'
}

function buildChartPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

function deriveInsights(sessions: SessionSummary[], range: DayRange): string[] {
  const scored = sessions.filter((s) => s.severity_score !== null)
  if (scored.length === 0) return ['No completed sessions yet. Start recording to see insights.']

  const insights: string[] = []

  const avg = scored.reduce((sum, s) => sum + (s.severity_score ?? 0), 0) / scored.length

  const half = Math.floor(scored.length / 2)
  if (half >= 1) {
    const firstHalf = scored.slice(0, half)
    const secondHalf = scored.slice(half)
    const firstAvg = firstHalf.reduce((s, x) => s + (x.severity_score ?? 0), 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((s, x) => s + (x.severity_score ?? 0), 0) / secondHalf.length
    const delta = secondAvg - firstAvg
    if (Math.abs(delta) < 3) {
      insights.push(`Severity stable over the last ${range} days (avg ${avg.toFixed(1)}).`)
    } else if (delta < 0) {
      insights.push(`Severity improving — down ${Math.abs(delta).toFixed(1)} pts in the second half of the period.`)
    } else {
      insights.push(`Severity increasing — up ${delta.toFixed(1)} pts in the second half of the period.`)
    }
  }

  const highCount = scored.filter((s) => (s.severity_score ?? 0) >= 60).length
  if (highCount > 0) {
    insights.push(`${highCount} session${highCount > 1 ? 's' : ''} with high severity (≥ 60) in this period.`)
  }

  const avgEvents = sessions.reduce((sum, s) => sum + s.event_count, 0) / sessions.length
  insights.push(`Average ${avgEvents.toFixed(0)} tic events per session.`)

  return insights
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<DayRange>(30)
  const [activeOverlays, setActiveOverlays] = useState<Set<HealthOverlay>>(new Set())
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [])

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - range)

  const inRange = sessions
    .filter((s) => s.status === 'completed' && s.severity_score !== null && new Date(s.started_at) >= cutoff)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())

  const allInRange = sessions
    .filter((s) => new Date(s.started_at) >= cutoff)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())

  const avgSeverity =
    inRange.length > 0
      ? inRange.reduce((sum, s) => sum + (s.severity_score ?? 0), 0) / inRange.length
      : null

  const half = Math.floor(inRange.length / 2)
  let trend: 'up' | 'down' | 'stable' | null = null
  if (half >= 1) {
    const firstAvg =
      inRange.slice(0, half).reduce((s, x) => s + (x.severity_score ?? 0), 0) / half
    const secondAvg =
      inRange.slice(half).reduce((s, x) => s + (x.severity_score ?? 0), 0) /
      (inRange.length - half)
    const delta = secondAvg - firstAvg
    trend = Math.abs(delta) < 3 ? 'stable' : delta < 0 ? 'down' : 'up'
  }

  const plotW = CHART_W - PAD.left - PAD.right
  const plotH = CHART_H - PAD.top - PAD.bottom

  const xScale = (date: Date): number => {
    if (inRange.length < 2) return PAD.left + plotW / 2
    const min = new Date(inRange[0].started_at).getTime()
    const max = new Date(inRange[inRange.length - 1].started_at).getTime()
    const span = max - min || 1
    return PAD.left + ((date.getTime() - min) / span) * plotW
  }

  const yScale = (score: number): number => {
    return PAD.top + plotH - (score / 100) * plotH
  }

  const chartPoints = inRange.map((s) => ({
    x: xScale(new Date(s.started_at)),
    y: yScale(s.severity_score ?? 0),
    score: s.severity_score ?? 0,
    date: new Date(s.started_at).toLocaleDateString(),
  }))

  const yGridLines = [0, 25, 50, 75, 100]

  function toggleOverlay(o: HealthOverlay) {
    setActiveOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(o)) next.delete(o)
      else next.add(o)
      return next
    })
  }

  const insights = deriveInsights(allInRange, range)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Severity trends and session overview.</p>
        </div>
        <div className="flex gap-1">
          {([7, 30, 90] as DayRange[]).map((d) => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                range === d
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sessions</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{allInRange.length}</p>
              <p className="mt-1 text-xs text-gray-400">Last {range} days</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Avg Severity</p>
              <p
                className="mt-1 text-3xl font-bold"
                style={{ color: avgSeverity !== null ? severityColor(avgSeverity) : '#9ca3af' }}
              >
                {avgSeverity !== null ? avgSeverity.toFixed(1) : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-400">Completed sessions</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Trend</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'stable' ? '→' : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {trend === 'up'
                  ? 'Worsening'
                  : trend === 'down'
                    ? 'Improving'
                    : trend === 'stable'
                      ? 'Stable'
                      : 'Not enough data'}
              </p>
            </div>
          </div>

          {/* SVG chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Severity Over Time</p>
            {inRange.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">
                No completed sessions in the last {range} days.
              </p>
            ) : (
              <div className="relative" ref={chartRef}>
                {tooltip && (
                  <div
                    className="absolute z-10 rounded bg-gray-900 px-2 py-1 text-xs text-white pointer-events-none whitespace-nowrap"
                    style={{ left: tooltip.x + 10, top: tooltip.y - 36 }}
                  >
                    {tooltip.label}
                  </div>
                )}
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="w-full"
                style={{ height: CHART_H }}
              >
                {yGridLines.map((y) => (
                  <g key={y}>
                    <line
                      x1={PAD.left}
                      y1={yScale(y)}
                      x2={CHART_W - PAD.right}
                      y2={yScale(y)}
                      stroke="#f3f4f6"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 6}
                      y={yScale(y)}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={10}
                      fill="#9ca3af"
                    >
                      {y}
                    </text>
                  </g>
                ))}

                {inRange.length > 1 && (
                  <path
                    d={buildChartPath(chartPoints)}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {chartPoints.map((p, i) => (
                  <g
                    key={i}
                    onMouseEnter={(e) => {
                      const rect = chartRef.current?.getBoundingClientRect()
                      if (!rect) return
                      setTooltip({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                        label: `${p.date}: ${p.score.toFixed(1)}`,
                      })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={5}
                      fill={severityColor(p.score)}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  </g>
                ))}

                <line
                  x1={PAD.left}
                  y1={PAD.top + plotH}
                  x2={CHART_W - PAD.right}
                  y2={PAD.top + plotH}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
              </svg>
              </div>
            )}
          </div>

          {/* Health overlays */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Health Overlays</p>
            <div className="flex gap-2 flex-wrap">
              {(['heart_rate', 'sleep', 'steps'] as HealthOverlay[]).map((o) => (
                <button
                  key={o}
                  onClick={() => toggleOverlay(o)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activeOverlays.has(o)
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {o === 'heart_rate' ? 'Heart Rate' : o === 'sleep' ? 'Sleep' : 'Steps'}
                </button>
              ))}
            </div>
            {activeOverlays.size > 0 && (
              <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Health data integration not connected yet. Overlays will appear here once wearable
                sync is configured.
              </p>
            )}
          </div>

          {/* Correlation highlights */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Correlation Highlights</p>
            <p className="text-xs text-gray-400">
              Correlations between tic severity and health metrics (sleep quality, heart rate
              variability, activity level) will appear here once health data sources are connected.
            </p>
          </div>

          {/* Automated insights */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Insights</p>
            <ul className="space-y-2">
              {insights.map((insight, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600">
                  <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-400" />
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
