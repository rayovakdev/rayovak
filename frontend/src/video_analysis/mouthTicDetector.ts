import type { LandmarkPipeline, FrameMetrics } from './landmarkPipeline'

export interface TicEvent {
  timestamp: number
  displacement: number
  confidence: number
  landmarkGroup: 'mouth'
}

type TicListener = (event: TicEvent) => void

const MIN_VELOCITY = 0.005
const WINDOW_SIZE = 30

function computeStats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return { mean, std: Math.sqrt(variance) }
}

export class MouthTicDetector {
  private readonly sigmaThreshold: number
  private readonly listeners = new Set<TicListener>()
  private readonly unsubscribe: () => void

  private inCandidate = false
  private candidateStartTime = 0
  private peakVelocity = 0
  private prevNormalizedLipGap: number | null = null
  private readonly velocityWindow: number[] = []

  constructor(pipeline: LandmarkPipeline, options?: { sigmaThreshold?: number }) {
    this.sigmaThreshold = options?.sigmaThreshold ?? 2.0
    this.unsubscribe = pipeline.subscribe((metrics) => this.process(metrics))
  }

  private process(metrics: FrameMetrics): void {
    const faceLandmarks = metrics.face?.landmarks
    if (!faceLandmarks || faceLandmarks.length <= 263) {
      this.prevNormalizedLipGap = null
      return
    }

    const upperLip = faceLandmarks[13]
    const lowerLip = faceLandmarks[14]
    const leftEye = faceLandmarks[33]
    const rightEye = faceLandmarks[263]

    const lipGap = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y)
    const interOcular = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)

    if (interOcular === 0) {
      this.prevNormalizedLipGap = null
      return
    }

    const normalizedLipGap = lipGap / interOcular
    const mouthVelocity =
      this.prevNormalizedLipGap !== null
        ? Math.abs(normalizedLipGap - this.prevNormalizedLipGap)
        : 0
    this.prevNormalizedLipGap = normalizedLipGap

    this.velocityWindow.push(mouthVelocity)
    if (this.velocityWindow.length > WINDOW_SIZE) this.velocityWindow.shift()

    const { mean, std } = computeStats(this.velocityWindow)
    const threshold = mean + this.sigmaThreshold * std

    if (!this.inCandidate) {
      if (mouthVelocity > threshold && threshold > 0 && mouthVelocity > MIN_VELOCITY) {
        this.inCandidate = true
        this.candidateStartTime = metrics.timestamp
        this.peakVelocity = mouthVelocity
      }
    } else {
      if (mouthVelocity > this.peakVelocity) this.peakVelocity = mouthVelocity
      if (mouthVelocity <= threshold) {
        const duration = metrics.timestamp - this.candidateStartTime
        if (duration < 500) {
          const sigma = this.sigmaThreshold * std + 1e-9
          const confidence = Math.min(1.0, (this.peakVelocity - mean) / sigma / 3)
          const event: TicEvent = {
            timestamp: metrics.timestamp,
            displacement: this.peakVelocity,
            confidence,
            landmarkGroup: 'mouth',
          }
          this.listeners.forEach((l) => l(event))
        }
        this.inCandidate = false
        this.peakVelocity = 0
      }
    }
  }

  subscribe(listener: TicListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.unsubscribe()
    this.listeners.clear()
  }
}
