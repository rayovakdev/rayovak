import type { LandmarkPipeline, FrameMetrics } from './landmarkPipeline'

export interface TicEvent {
  timestamp: number
  displacement: number
  confidence: number
  landmarkGroup: 'mouth'
}

type TicListener = (event: TicEvent) => void

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

  constructor(pipeline: LandmarkPipeline, options?: { sigmaThreshold?: number }) {
    this.sigmaThreshold = options?.sigmaThreshold ?? 2.0
    this.unsubscribe = pipeline.subscribe((metrics) => this.process(metrics, pipeline))
  }

  private process(metrics: FrameMetrics, pipeline: LandmarkPipeline): void {
    const mouthVelocity = metrics.mouth?.velocity ?? 0
    const window = pipeline.getWindow()
    const velocities = window.map((f) => f.mouth?.velocity ?? 0)
    const { mean, std } = computeStats(velocities)
    const threshold = mean + this.sigmaThreshold * std

    if (!this.inCandidate) {
      if (mouthVelocity > threshold && threshold > 0) {
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
