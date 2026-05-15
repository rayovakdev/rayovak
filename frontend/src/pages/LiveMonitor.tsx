import { useCallback, useEffect, useRef, useState } from 'react'
import { createSession, appendEvents, completeSession } from '../api/sessions'
import type { TicEventPayload } from '../api/sessions'
import { FaceMesh, FACEMESH_TESSELATION } from '@mediapipe/face_mesh'
import type { Results as FaceMeshResults } from '@mediapipe/face_mesh'
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import type { Results as HandsResults, NormalizedLandmark } from '@mediapipe/hands'
import { LandmarkPipeline } from '../video_analysis/landmarkPipeline'
import type { LandmarkPoint } from '../video_analysis/landmarkPipeline'
import { MouthTicDetector } from '../video_analysis/mouthTicDetector'
import { HandTicDetector } from '../video_analysis/handTicDetector'

const FACE_MESH_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619'
const HANDS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240'

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  connections: Array<[number, number]>,
  w: number,
  h: number,
  color: string,
  lineWidth: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  for (const [start, end] of connections) {
    const a = landmarks[start]
    const b = landmarks[end]
    ctx.beginPath()
    ctx.moveTo(a.x * w, a.y * h)
    ctx.lineTo(b.x * w, b.y * h)
    ctx.stroke()
  }
}

type SessionEvent = {
  timestamp: number
  tic_type: 'mouth' | 'hand' | 'face' | 'body' | 'manual'
  confidence: number
}

const GAUGE_ARC_LENGTH = Math.PI * 40

export default function LiveMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceMeshRef = useRef<FaceMesh | null>(null)
  const handsRef = useRef<Hands | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const isProcessingRef = useRef(false)
  const faceResultsRef = useRef<FaceMeshResults | null>(null)
  const handResultsRef = useRef<HandsResults | null>(null)
  const pipelineRef = useRef(new LandmarkPipeline())
  const detectorRef = useRef<MouthTicDetector | null>(null)
  const handDetectorRef = useRef<HandTicDetector | null>(null)
  const isRecordingRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const pendingEventsRef = useRef<TicEventPayload[]>([])
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([])
  const [tagFlash, setTagFlash] = useState(false)
  const [manualTagCount, setManualTagCount] = useState(0)

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  const onFaceResults = useCallback((results: FaceMeshResults) => {
    faceResultsRef.current = results
  }, [])

  const onHandResults = useCallback((results: HandsResults) => {
    handResultsRef.current = results
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = video.videoWidth
    const h = video.videoHeight
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    ctx.clearRect(0, 0, w, h)

    const faceResults = faceResultsRef.current
    if (faceResults?.multiFaceLandmarks) {
      for (const landmarks of faceResults.multiFaceLandmarks) {
        drawConnections(ctx, landmarks, FACEMESH_TESSELATION as Array<[number, number]>, w, h, 'rgba(0, 200, 100, 0.35)', 0.5)
        ctx.fillStyle = 'rgba(255, 50, 50, 0.85)'
        for (const lm of landmarks) {
          ctx.beginPath()
          ctx.arc(lm.x * w, lm.y * h, 1.5, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
    }

    const handResults = handResultsRef.current
    if (handResults?.multiHandLandmarks) {
      for (const landmarks of handResults.multiHandLandmarks) {
        drawConnections(ctx, landmarks, HAND_CONNECTIONS, w, h, 'rgba(0, 120, 255, 0.7)', 1.5)
        ctx.fillStyle = 'rgba(0, 210, 255, 0.9)'
        for (const lm of landmarks) {
          ctx.beginPath()
          ctx.arc(lm.x * w, lm.y * h, 3, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
    }
  }, [])

  const runLoop = useCallback(async () => {
    const video = videoRef.current
    const faceMesh = faceMeshRef.current
    const hands = handsRef.current
    if (video && faceMesh && hands && video.readyState >= 2 && !isProcessingRef.current) {
      isProcessingRef.current = true
      await faceMesh.send({ image: video })
      await hands.send({ image: video })
      draw()

      const faceLandmarks = (faceResultsRef.current?.multiFaceLandmarks?.[0] as LandmarkPoint[] | undefined) ?? null
      const handResults = handResultsRef.current
      let leftHandLandmarks: LandmarkPoint[] | null = null
      let rightHandLandmarks: LandmarkPoint[] | null = null
      if (handResults?.multiHandLandmarks) {
        for (let i = 0; i < handResults.multiHandLandmarks.length; i++) {
          const label = (handResults as { multiHandedness?: Array<{ label: string }> }).multiHandedness?.[i]?.label
          if (label === 'Left') rightHandLandmarks = handResults.multiHandLandmarks[i] as unknown as LandmarkPoint[]
          else if (label === 'Right') leftHandLandmarks = handResults.multiHandLandmarks[i] as unknown as LandmarkPoint[]
        }
      }
      pipelineRef.current.process(faceLandmarks, leftHandLandmarks, rightHandLandmarks)

      isProcessingRef.current = false
    }
    animFrameRef.current = requestAnimationFrame(runLoop)
  }, [draw])

  const stopRecording = useCallback(async () => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current)
      flushIntervalRef.current = null
    }
    const id = sessionIdRef.current
    isRecordingRef.current = false
    sessionIdRef.current = null
    setIsRecording(false)
    setRecordingSeconds(0)
    if (id) {
      const remaining = pendingEventsRef.current.splice(0)
      if (remaining.length > 0) await appendEvents(id, remaining)
      await completeSession(id)
    }
    setTagFlash(false)
    setManualTagCount(0)
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const { session_id } = await createSession()
      sessionIdRef.current = session_id
      pendingEventsRef.current = []
      setSessionEvents([])
      setRecordingSeconds(0)
      setIsRecording(true)
      isRecordingRef.current = true

      sessionTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1)
      }, 1000)

      flushIntervalRef.current = setInterval(async () => {
        const batch = pendingEventsRef.current.splice(0)
        if (batch.length > 0 && sessionIdRef.current) {
          await appendEvents(sessionIdRef.current, batch)
        }
      }, 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording')
    }
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      await video.play()

      const faceMesh = new FaceMesh({
        locateFile: (file) => `${FACE_MESH_CDN}/${file}`,
      })
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      faceMesh.onResults(onFaceResults)
      await faceMesh.initialize()
      faceMeshRef.current = faceMesh

      const hands = new Hands({
        locateFile: (file) => `${HANDS_CDN}/${file}`,
      })
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      hands.onResults(onHandResults)
      await hands.initialize()
      handsRef.current = hands

      const faceSigma = parseFloat(localStorage.getItem('ray_face_sigma') ?? '2.0')
      const detector = new MouthTicDetector(pipelineRef.current, { sigmaThreshold: faceSigma })
      detector.subscribe((event) => {
        if (isRecordingRef.current) {
          pendingEventsRef.current.push({
            timestamp: new Date(event.timestamp).toISOString(),
            tic_type: 'mouth',
            confidence: event.confidence,
          })
          setSessionEvents((prev) => [
            ...prev,
            { timestamp: event.timestamp, tic_type: 'mouth', confidence: event.confidence },
          ])
        }
      })
      detectorRef.current = detector

      const handMinVelocity = parseFloat(localStorage.getItem('ray_hand_min_velocity') ?? '0.005')
      const handDetector = new HandTicDetector(pipelineRef.current, { minVelocity: handMinVelocity })
      handDetector.subscribe((event) => {
        if (isRecordingRef.current) {
          pendingEventsRef.current.push({
            timestamp: new Date(event.timestamp).toISOString(),
            tic_type: 'hand',
            confidence: event.confidence,
          })
          setSessionEvents((prev) => [
            ...prev,
            { timestamp: event.timestamp, tic_type: 'hand', confidence: event.confidence },
          ])
        }
      })
      handDetectorRef.current = handDetector

      setIsRunning(true)
      animFrameRef.current = requestAnimationFrame(runLoop)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access failed')
    }
  }, [onFaceResults, onHandResults, runLoop])

  const stopCamera = useCallback(() => {
    if (isRecordingRef.current) void stopRecording()
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    faceMeshRef.current?.close()
    faceMeshRef.current = null
    handsRef.current?.close()
    handsRef.current = null
    faceResultsRef.current = null
    handResultsRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    detectorRef.current?.destroy()
    detectorRef.current = null
    handDetectorRef.current?.destroy()
    handDetectorRef.current = null
    pipelineRef.current.reset()
    setSessionEvents([])
    setTagFlash(false)
    setManualTagCount(0)
    setIsRunning(false)
  }, [stopRecording])

  useEffect(() => stopCamera, [stopCamera])

  const tagManualTic = useCallback(() => {
    if (!isRecordingRef.current) return
    const now = Date.now()
    pendingEventsRef.current.push({
      timestamp: new Date(now).toISOString(),
      tic_type: 'manual',
      confidence: 1.0,
    })
    setSessionEvents((prev) => [...prev, { timestamp: now, tic_type: 'manual', confidence: 1.0 }])
    setManualTagCount((n) => n + 1)
    setTagFlash(true)
    setTimeout(() => setTagFlash(false), 800)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      e.preventDefault()
      tagManualTic()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tagManualTic])

  const totalCount = sessionEvents.length
  const mouthCount = sessionEvents.filter((e) => e.tic_type === 'mouth').length
  const handCount = sessionEvents.filter((e) => e.tic_type === 'hand').length
  const avgConf = totalCount > 0 ? sessionEvents.reduce((sum, e) => sum + e.confidence, 0) / totalCount : 0
  const durationMins = recordingSeconds / 60

  const freqScore = durationMins > 0 ? Math.min(100, (totalCount / durationMins / 5.0) * 50) : 0
  const intensityScore = Math.min(100, avgConf * 100)
  const detectedTypes = new Set(sessionEvents.filter((e) => e.tic_type !== 'manual').map((e) => e.tic_type))
  const varietyScore = Math.min(100, (detectedTypes.size / 4) * 100)
  const typeCounts: Record<string, number> = {}
  for (const e of sessionEvents) typeCounts[e.tic_type] = (typeCounts[e.tic_type] ?? 0) + 1
  const maxTypeCount = totalCount > 0 ? Math.max(...Object.values(typeCounts)) : 0
  const repetitivenessScore = totalCount > 0 ? Math.min(100, (maxTypeCount / totalCount) * 100) : 0
  const severityScore = Math.round(
    freqScore * 0.4 + intensityScore * 0.25 + repetitivenessScore * 0.2 + varietyScore * 0.15,
  )

  const gaugeColor = severityScore < 34 ? '#22c55e' : severityScore < 67 ? '#f59e0b' : '#ef4444'
  const severityLabel =
    severityScore === 0
      ? '—'
      : severityScore < 26
        ? 'Minimal'
        : severityScore < 51
          ? 'Mild'
          : severityScore < 76
            ? 'Moderate'
            : 'Severe'
  const severityTextColor =
    severityScore === 0
      ? 'text-gray-400'
      : severityScore < 34
        ? 'text-green-600'
        : severityScore < 67
          ? 'text-amber-600'
          : 'text-red-600'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Live Monitor</h1>
        <p className="mt-1 text-sm text-gray-500">Real-time tic detection via webcam.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={isRunning ? stopCamera : startCamera}
          className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${
            isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {isRunning ? 'Stop Camera' : 'Start Camera'}
        </button>
        {isRunning && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${
              isRecording ? 'bg-red-700 hover:bg-red-800' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        )}
        {isRecording && (
          <span className="text-sm font-mono text-red-400">
            ● REC {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
            {String(recordingSeconds % 60).padStart(2, '0')}
          </span>
        )}
        {isRecording && (
          <button
            onClick={tagManualTic}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tagFlash ? 'bg-yellow-400 text-yellow-900' : 'bg-yellow-500 hover:bg-yellow-600 text-white'
            }`}
          >
            {tagFlash ? 'Tagged!' : 'Tag Tic Now'}
          </button>
        )}
        {isRecording && <span className="text-xs text-gray-400">or press Space</span>}
        {isRecording && manualTagCount > 0 && (
          <span className="text-xs text-yellow-600 font-mono">{manualTagCount} manual</span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Always mounted so video/canvas refs are stable; outer div hidden when camera is off */}
      <div className="flex gap-6 items-start" style={{ display: isRunning ? undefined : 'none' }}>
        {/* Camera feed — left column */}
        <div className="flex-[3] min-w-0">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video ref={videoRef} className="w-full block" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          </div>
        </div>

        {/* Stats panel — right column */}
        <div className="flex-[2] min-w-0 space-y-3">
          {/* Severity gauge */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Severity Score</p>
            <svg viewBox="0 0 100 56" className="w-full max-w-[160px] mx-auto">
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke={gaugeColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${GAUGE_ARC_LENGTH}`}
                strokeDashoffset={`${GAUGE_ARC_LENGTH * (1 - severityScore / 100)}`}
              />
            </svg>
            <p className="text-4xl font-bold text-gray-900 -mt-1">{severityScore}</p>
            <p className={`text-sm font-medium mt-0.5 ${severityTextColor}`}>{severityLabel}</p>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { label: 'Mouth Tics', value: String(mouthCount) },
                { label: 'Hand Tics', value: String(handCount) },
                { label: 'Manual Tags', value: String(manualTagCount) },
                { label: 'Avg Confidence', value: totalCount > 0 ? `${Math.round(avgConf * 100)}%` : '—' },
              ] as const
            ).map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Event log */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Event Log</p>
            </div>
            <div className="h-48 overflow-y-auto p-2 space-y-0.5">
              {sessionEvents.length === 0 ? (
                <p className="text-xs text-gray-400 p-1">
                  {isRecording ? 'Waiting for events…' : 'Start recording to see events'}
                </p>
              ) : (
                [...sessionEvents].reverse().map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-gray-400 flex-shrink-0">
                      {new Date(e.timestamp).toISOString().slice(11, 19)}
                    </span>
                    <span
                      className={`flex-shrink-0 font-semibold ${
                        e.tic_type === 'mouth'
                          ? 'text-yellow-600'
                          : e.tic_type === 'hand'
                            ? 'text-blue-600'
                            : e.tic_type === 'manual'
                              ? 'text-purple-600'
                              : 'text-gray-600'
                      }`}
                    >
                      {e.tic_type}
                    </span>
                    <span className="text-gray-400">{e.confidence.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
