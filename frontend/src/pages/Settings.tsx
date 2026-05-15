import { useEffect, useState } from 'react'
import { listSessions, getSession } from '../api/sessions'
import { connectGarmin, disconnectGarmin, getGarminStatus, type GarminStatus } from '../api/garmin'

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Settings() {
  const [faceSigma, setFaceSigma] = useState(
    parseFloat(localStorage.getItem('ray_face_sigma') ?? '2.0'),
  )
  const [handMinVelocity, setHandMinVelocity] = useState(
    parseFloat(localStorage.getItem('ray_hand_min_velocity') ?? '0.005'),
  )
  const [exportingSessionsCsv, setExportingSessionsCsv] = useState(false)
  const [exportingSessionsJson, setExportingSessionsJson] = useState(false)
  const [garminStatus, setGarminStatus] = useState<GarminStatus | null>(null)
  const [garminLoading, setGarminLoading] = useState(false)
  const [garminError, setGarminError] = useState<string | null>(null)

  useEffect(() => {
    getGarminStatus()
      .then(setGarminStatus)
      .catch(() => null)
  }, [])

  function handleFaceSigmaChange(value: number): void {
    setFaceSigma(value)
    localStorage.setItem('ray_face_sigma', String(value))
  }

  function handleHandMinVelocityChange(value: number): void {
    setHandMinVelocity(value)
    localStorage.setItem('ray_hand_min_velocity', String(value))
  }

  async function exportSessionsCsv(): Promise<void> {
    setExportingSessionsCsv(true)
    try {
      const sessions = await listSessions()
      const header = 'session_id,started_at,completed_at,status,severity_score,event_count'
      const rows = sessions.map(
        (s) =>
          `${s.session_id},${s.started_at},${s.completed_at ?? ''},${s.status},${s.severity_score ?? ''},${s.event_count}`,
      )
      triggerDownload([header, ...rows].join('\n'), 'sessions.csv', 'text/csv')
    } finally {
      setExportingSessionsCsv(false)
    }
  }

  async function exportSessionsJson(): Promise<void> {
    setExportingSessionsJson(true)
    try {
      const summaries = await listSessions()
      const details = await Promise.all(summaries.map((s) => getSession(s.session_id)))
      triggerDownload(JSON.stringify(details, null, 2), 'sessions.json', 'application/json')
    } finally {
      setExportingSessionsJson(false)
    }
  }

  async function handleGarminConnect(): Promise<void> {
    setGarminLoading(true)
    setGarminError(null)
    try {
      const status = await connectGarmin()
      setGarminStatus(status)
    } catch (err) {
      setGarminError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setGarminLoading(false)
    }
  }

  async function handleGarminDisconnect(): Promise<void> {
    setGarminLoading(true)
    setGarminError(null)
    try {
      const status = await disconnectGarmin()
      setGarminStatus(status)
    } catch (err) {
      setGarminError(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setGarminLoading(false)
    }
  }

  function exportHealthCsv(): void {
    triggerDownload('timestamp,metric,value,unit\n', 'health_data.csv', 'text/csv')
  }

  function exportHealthJson(): void {
    triggerDownload('[]', 'health_data.json', 'application/json')
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-800">Detection Sensitivity</h2>
        <p className="mt-1 text-sm text-gray-500">Changes take effect on next camera start.</p>

        <div className="mt-4 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Face Tic Threshold (σ): {faceSigma.toFixed(1)}
            </label>
            <input
              type="range"
              min={1.0}
              max={4.0}
              step={0.1}
              value={faceSigma}
              onChange={(e) => handleFaceSigmaChange(parseFloat(e.target.value))}
              className="mt-2 w-full accent-indigo-600"
            />
            <p className="mt-1 text-xs text-gray-400">
              Lower = more sensitive, more detections. Higher = fewer false positives.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Hand Movement Threshold: {handMinVelocity.toFixed(3)}
            </label>
            <input
              type="range"
              min={0.001}
              max={0.02}
              step={0.001}
              value={handMinVelocity}
              onChange={(e) => handleHandMinVelocityChange(parseFloat(e.target.value))}
              className="mt-2 w-full accent-indigo-600"
            />
            <p className="mt-1 text-xs text-gray-400">
              Lower = more sensitive, more detections. Higher = fewer false positives.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-800">Garmin Connect</h2>
        <div className="mt-4 flex items-center gap-3">
          {garminStatus?.connected ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-green-600">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              Connected
              {garminStatus.display_name && ` as ${garminStatus.display_name}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
              Not connected
            </span>
          )}
          {garminStatus?.connected ? (
            <button
              onClick={() => void handleGarminDisconnect()}
              disabled={garminLoading}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {garminLoading ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={() => void handleGarminConnect()}
              disabled={garminLoading}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {garminLoading ? 'Connecting…' : 'Connect Garmin'}
            </button>
          )}
        </div>
        {garminStatus?.last_auth_at && (
          <p className="mt-2 text-sm text-gray-500">
            Last connected: {new Date(garminStatus.last_auth_at).toLocaleString()}
          </p>
        )}
        {garminError && <p className="mt-2 text-sm text-red-600">{garminError}</p>}
        <p className="mt-2 text-xs text-gray-400">
          Set GARMIN_EMAIL and GARMIN_PASSWORD in your .env to enable connection.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-800">Data Export</h2>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Session Data</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void exportSessionsCsv()}
                disabled={exportingSessionsCsv}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {exportingSessionsCsv ? 'Exporting…' : 'Export CSV'}
              </button>
              <button
                onClick={() => void exportSessionsJson()}
                disabled={exportingSessionsJson}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {exportingSessionsJson ? 'Exporting…' : 'Export JSON'}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Health Data</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={exportHealthCsv}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={exportHealthJson}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                Export JSON
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">Health data integration coming soon.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
