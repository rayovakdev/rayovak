import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceMesh, FACEMESH_TESSELATION } from '@mediapipe/face_mesh'
import type { Results as FaceMeshResults } from '@mediapipe/face_mesh'
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import type { Results as HandsResults, NormalizedLandmark } from '@mediapipe/hands'
import { LandmarkPipeline } from '../video_analysis/landmarkPipeline'
import type { FrameMetrics, LandmarkPoint } from '../video_analysis/landmarkPipeline'

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
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestMetrics, setLatestMetrics] = useState<FrameMetrics | null>(null)

  useEffect(() => {
    return pipelineRef.current.subscribe(setLatestMetrics)
  }, [])

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
          if (label === 'Left') leftHandLandmarks = handResults.multiHandLandmarks[i] as unknown as LandmarkPoint[]
          else if (label === 'Right') rightHandLandmarks = handResults.multiHandLandmarks[i] as unknown as LandmarkPoint[]
        }
      }
      pipelineRef.current.process(faceLandmarks, leftHandLandmarks, rightHandLandmarks)

      isProcessingRef.current = false
    }
    animFrameRef.current = requestAnimationFrame(runLoop)
  }, [draw])

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

      setIsRunning(true)
      animFrameRef.current = requestAnimationFrame(runLoop)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access failed')
    }
  }, [onFaceResults, onHandResults, runLoop])

  const stopCamera = useCallback(() => {
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
    pipelineRef.current.reset()
    setLatestMetrics(null)
    setIsRunning(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const vel = (v: number | undefined) => (v ?? 0).toFixed(4)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Live Monitor</h1>
      <p className="mt-1 text-sm text-gray-500">Real-time facial and hand landmark detection via webcam.</p>

      <div className="mt-6">
        <button
          onClick={isRunning ? stopCamera : startCamera}
          className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${
            isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {isRunning ? 'Stop Camera' : 'Start Camera'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Always mounted so refs are stable when startCamera() is called */}
      <div
        className="relative mt-4 inline-block rounded-lg overflow-hidden"
        style={{ display: isRunning ? 'inline-block' : 'none' }}
      >
        <video ref={videoRef} className="block" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {isRunning && latestMetrics && (
        <p className="text-xs text-gray-400 font-mono mt-2">
          Face vel: {vel(latestMetrics.face?.velocity)}&nbsp;&nbsp;Mouth vel:{' '}
          {vel(latestMetrics.mouth?.velocity)}&nbsp;&nbsp;L-Hand vel:{' '}
          {vel(latestMetrics.leftHand?.velocity)}&nbsp;&nbsp;R-Hand vel:{' '}
          {vel(latestMetrics.rightHand?.velocity)}
        </p>
      )}
    </div>
  )
}
