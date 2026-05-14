import type { LandmarkPipeline, FrameMetrics } from './landmarkPipeline'

export type HandSide = 'left' | 'right'

export interface HandTicEvent {
  timestamp: number
  hand: HandSide
  repetitionCount: number
  confidence: number
}

type HandTicListener = (event: HandTicEvent) => void

const WINDOW_MS = 10_000

class HandTracker {
  private readonly side: HandSide
  private readonly minVelocity: number
  private readonly similarityThreshold: number
  private readonly minRepetitions: number
  private readonly listeners: Set<HandTicListener>

  private readonly bursts: Array<{ timestamp: number; peakVelocity: number }> = []
  private inBurst = false
  private burstPeak = 0
  private burstStart = 0

  constructor(
    side: HandSide,
    minVelocity: number,
    similarityThreshold: number,
    minRepetitions: number,
    listeners: Set<HandTicListener>,
  ) {
    this.side = side
    this.minVelocity = minVelocity
    this.similarityThreshold = similarityThreshold
    this.minRepetitions = minRepetitions
    this.listeners = listeners
  }

  process(velocity: number, timestamp: number): void {
    const cutoff = timestamp - WINDOW_MS
    while (this.bursts.length > 0 && this.bursts[0].timestamp < cutoff) {
      this.bursts.shift()
    }

    if (!this.inBurst) {
      if (velocity > this.minVelocity) {
        this.inBurst = true
        this.burstStart = timestamp
        this.burstPeak = velocity
      }
    } else {
      if (velocity > this.burstPeak) this.burstPeak = velocity
      if (velocity <= this.minVelocity) {
        this.bursts.push({ timestamp: this.burstStart, peakVelocity: this.burstPeak })
        this.inBurst = false

        const refPeak = this.burstPeak
        const similar = this.bursts.filter(
          (b) => Math.abs(b.peakVelocity - refPeak) <= this.similarityThreshold,
        )

        if (similar.length >= this.minRepetitions) {
          const confidence = Math.min(1.0, similar.length / (this.minRepetitions * 2))
          this.listeners.forEach((l) =>
            l({ timestamp, hand: this.side, repetitionCount: similar.length, confidence }),
          )
          this.bursts.length = 0
        }
      }
    }
  }

  reset(): void {
    this.bursts.length = 0
    this.inBurst = false
    this.burstPeak = 0
  }
}

export class HandTicDetector {
  private readonly listeners = new Set<HandTicListener>()
  private readonly unsubscribe: () => void
  private readonly leftTracker: HandTracker
  private readonly rightTracker: HandTracker

  constructor(
    pipeline: LandmarkPipeline,
    options?: { minVelocity?: number; similarityThreshold?: number; minRepetitions?: number },
  ) {
    const minVelocity = options?.minVelocity ?? 0.005
    const similarityThreshold = options?.similarityThreshold ?? 0.02
    const minRepetitions = options?.minRepetitions ?? 3

    this.leftTracker = new HandTracker('left', minVelocity, similarityThreshold, minRepetitions, this.listeners)
    this.rightTracker = new HandTracker('right', minVelocity, similarityThreshold, minRepetitions, this.listeners)

    this.unsubscribe = pipeline.subscribe((metrics: FrameMetrics) => {
      if (metrics.leftHand) this.leftTracker.process(metrics.leftHand.velocity, metrics.timestamp)
      if (metrics.rightHand) this.rightTracker.process(metrics.rightHand.velocity, metrics.timestamp)
    })
  }

  subscribe(listener: HandTicListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.unsubscribe()
    this.listeners.clear()
  }
}
