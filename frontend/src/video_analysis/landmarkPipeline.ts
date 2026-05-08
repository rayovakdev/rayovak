export interface LandmarkPoint {
  x: number
  y: number
  z: number
}

export interface LandmarkGroup {
  landmarks: LandmarkPoint[]
  centroid: LandmarkPoint
  velocity: number
  acceleration: number
}

export interface FrameMetrics {
  timestamp: number
  face: LandmarkGroup | null
  mouth: LandmarkGroup | null
  leftHand: LandmarkGroup | null
  rightHand: LandmarkGroup | null
}

type MetricsListener = (metrics: FrameMetrics) => void

const MOUTH_INDICES = new Set([
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
])

function computeCentroid(landmarks: LandmarkPoint[]): LandmarkPoint {
  const n = landmarks.length
  let x = 0
  let y = 0
  let z = 0
  for (const lm of landmarks) {
    x += lm.x
    y += lm.y
    z += lm.z
  }
  return { x: x / n, y: y / n, z: z / n }
}

function euclideanDistance(a: LandmarkPoint, b: LandmarkPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export class LandmarkPipeline {
  private readonly windowSize: number
  private window: FrameMetrics[] = []
  private listeners: Set<MetricsListener> = new Set()
  private prevMetrics: FrameMetrics | null = null

  constructor(windowSize = 30) {
    this.windowSize = windowSize
  }

  private buildGroup(
    landmarks: LandmarkPoint[],
    prev: LandmarkGroup | null,
    prevVelocity: number,
  ): LandmarkGroup {
    const c = computeCentroid(landmarks)
    const vel = prev !== null ? euclideanDistance(c, prev.centroid) : 0
    const acc = Math.abs(vel - prevVelocity)
    return { landmarks, centroid: c, velocity: vel, acceleration: acc }
  }

  process(
    faceLandmarks: LandmarkPoint[] | null,
    leftHandLandmarks: LandmarkPoint[] | null,
    rightHandLandmarks: LandmarkPoint[] | null,
  ): FrameMetrics {
    const prev = this.prevMetrics

    let face: LandmarkGroup | null = null
    let mouth: LandmarkGroup | null = null
    if (faceLandmarks && faceLandmarks.length > 0) {
      face = this.buildGroup(faceLandmarks, prev?.face ?? null, prev?.face?.velocity ?? 0)
      const mouthLandmarks = faceLandmarks.filter((_, i) => MOUTH_INDICES.has(i))
      if (mouthLandmarks.length > 0) {
        mouth = this.buildGroup(mouthLandmarks, prev?.mouth ?? null, prev?.mouth?.velocity ?? 0)
      }
    }

    const leftHand =
      leftHandLandmarks && leftHandLandmarks.length > 0
        ? this.buildGroup(leftHandLandmarks, prev?.leftHand ?? null, prev?.leftHand?.velocity ?? 0)
        : null

    const rightHand =
      rightHandLandmarks && rightHandLandmarks.length > 0
        ? this.buildGroup(rightHandLandmarks, prev?.rightHand ?? null, prev?.rightHand?.velocity ?? 0)
        : null

    const metrics: FrameMetrics = { timestamp: Date.now(), face, mouth, leftHand, rightHand }

    this.window.push(metrics)
    if (this.window.length > this.windowSize) this.window.shift()

    this.prevMetrics = metrics
    for (const listener of this.listeners) listener(metrics)

    return metrics
  }

  getWindow(): readonly FrameMetrics[] {
    return this.window
  }

  reset(): void {
    this.window = []
    this.prevMetrics = null
  }

  subscribe(listener: MetricsListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
