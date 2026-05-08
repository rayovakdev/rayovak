import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceMesh, FACEMESH_TESSELATION } from '@mediapipe/face_mesh'
import type { Results, NormalizedLandmark, LandmarkConnectionArray } from '@mediapipe/face_mesh'

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619'

function drawTesselation(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  connections: LandmarkConnectionArray,
  w: number,
  h: number,
): void {
  ctx.strokeStyle = 'rgba(0, 200, 100, 0.35)'
  ctx.lineWidth = 0.5
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
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const isProcessingRef = useRef(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onResults = useCallback((results: Results) => {
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

    if (results.multiFaceLandmarks) {
      for (const landmarks of results.multiFaceLandmarks) {
        drawTesselation(ctx, landmarks, FACEMESH_TESSELATION, w, h)
        ctx.fillStyle = 'rgba(255, 50, 50, 0.85)'
        for (const lm of landmarks) {
          ctx.beginPath()
          ctx.arc(lm.x * w, lm.y * h, 1.5, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
    }
  }, [])

  const runLoop = useCallback(async () => {
    const video = videoRef.current
    const faceMesh = faceMeshRef.current
    if (video && faceMesh && video.readyState >= 2 && !isProcessingRef.current) {
      isProcessingRef.current = true
      await faceMesh.send({ image: video })
      isProcessingRef.current = false
    }
    animFrameRef.current = requestAnimationFrame(runLoop)
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
        locateFile: (file) => `${MEDIAPIPE_CDN}/${file}`,
      })
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      faceMesh.onResults(onResults)
      await faceMesh.initialize()
      faceMeshRef.current = faceMesh

      setIsRunning(true)
      animFrameRef.current = requestAnimationFrame(runLoop)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access failed')
    }
  }, [onResults, runLoop])

  const stopCamera = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    faceMeshRef.current?.close()
    faceMeshRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setIsRunning(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Live Monitor</h1>
      <p className="mt-1 text-sm text-gray-500">Real-time facial landmark detection via webcam.</p>

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
    </div>
  )
}
