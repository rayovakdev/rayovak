import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, type SessionDetail } from '../api/sessions'
import { uploadVideo } from '../api/upload'

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

const ACCEPTED = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_BYTES = 500 * 1024 * 1024

function severityColor(score: number): string {
  if (score < 30) return 'text-green-600'
  if (score < 60) return 'text-yellow-600'
  return 'text-red-600'
}

function severityLabel(score: number): string {
  if (score < 30) return 'Low'
  if (score < 60) return 'Moderate'
  return 'High'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function UploadAnalyze() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [uploadedFilename, setUploadedFilename] = useState('')
  const [uploadedBytes, setUploadedBytes] = useState(0)

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      setError('Unsupported file type. Please upload an MP4, WebM, or QuickTime video.')
      setPhase('error')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('File exceeds the 500 MB limit.')
      setPhase('error')
      return
    }

    setError(null)
    setProgress(0)
    setPhase('uploading')

    try {
      const result = await uploadVideo(file, setProgress)
      setUploadedFilename(result.filename)
      setUploadedBytes(result.size_bytes)
      setPhase('analyzing')

      const detail = await getSession(result.session_id)
      setSession(detail)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setPhase('error')
    }
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void processFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDragLeave = () => setDragging(false)

  const reset = () => {
    setPhase('idle')
    setProgress(0)
    setError(null)
    setSession(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload &amp; Analyze</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload a recorded video session to compute severity scores and review detected events.
        </p>
      </div>

      {phase === 'idle' || phase === 'error' ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            onChange={onFileChange}
            className="sr-only"
          />
          <div className="text-4xl mb-3">🎥</div>
          <p className="text-sm font-medium text-gray-700">
            Drop a video here or <span className="text-indigo-600 underline">browse</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">MP4, WebM, QuickTime · max 500 MB</p>

          {phase === 'error' && error && (
            <p className="mt-4 text-sm text-red-600 font-medium">{error}</p>
          )}
        </div>
      ) : phase === 'uploading' ? (
        <div className="border border-gray-200 rounded-xl p-8 space-y-4">
          <p className="text-sm font-medium text-gray-700">Uploading…</p>
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-right">{progress}%</p>
        </div>
      ) : phase === 'analyzing' ? (
        <div className="border border-gray-200 rounded-xl p-8 flex items-center gap-4">
          <svg
            className="animate-spin h-6 w-6 text-indigo-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-700">Analyzing video…</p>
        </div>
      ) : session ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-5 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Severity</p>
              {session.severity_score !== null ? (
                <>
                  <p className={`text-3xl font-bold ${severityColor(session.severity_score)}`}>
                    {session.severity_score.toFixed(1)}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 ${severityColor(session.severity_score)}`}>
                    {severityLabel(session.severity_score)}
                  </p>
                </>
              ) : (
                <p className="text-3xl font-bold text-gray-400">—</p>
              )}
            </div>

            <div className="border border-gray-200 rounded-xl p-5 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Events</p>
              <p className="text-3xl font-bold text-gray-900">{session.events.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">detected</p>
            </div>

            <div className="border border-gray-200 rounded-xl p-5 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">File</p>
              <p className="text-sm font-medium text-gray-700 truncate" title={uploadedFilename}>
                {uploadedFilename}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{formatBytes(uploadedBytes)}</p>
            </div>
          </div>

          {session.events.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <p className="text-xs uppercase tracking-wide text-gray-400 px-4 py-2 bg-gray-50 border-b border-gray-200">
                Event timeline
              </p>
              <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {session.events.map((ev, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-xs text-gray-400 tabular-nums w-16 shrink-0">
                      {formatTime(ev.timestamp)}
                    </span>
                    <span className="text-xs font-medium capitalize text-gray-700">{ev.tic_type}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {(ev.confidence * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/sessions/${session.session_id}`)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              View Full Session Detail →
            </button>
            <button
              onClick={reset}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
            >
              Upload another
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default UploadAnalyze
