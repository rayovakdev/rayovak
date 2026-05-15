import { api } from './client'

const BASE = '/api/v1/video_analysis/sessions'

export interface TicEventPayload {
  timestamp: string
  tic_type: 'mouth' | 'hand' | 'face' | 'body' | 'manual'
  confidence: number
}

export async function createSession(): Promise<{ session_id: string; started_at: string }> {
  return api.post<{ session_id: string; started_at: string }>(BASE, {})
}

export async function appendEvents(sessionId: string, events: TicEventPayload[]): Promise<void> {
  await api.post<void>(`${BASE}/${sessionId}/events`, { events })
}

export async function completeSession(sessionId: string): Promise<void> {
  await api.post<void>(`${BASE}/${sessionId}/complete`, {})
}

export interface SessionSummary {
  session_id: string
  started_at: string
  completed_at: string | null
  status: 'active' | 'completed'
  severity_score: number | null
  event_count: number
  confirmed_count: number
  rejected_count: number
}

export async function listSessions(): Promise<SessionSummary[]> {
  return api.get<SessionSummary[]>(BASE)
}

export interface TicEventRecord {
  timestamp: string
  tic_type: 'mouth' | 'hand' | 'face' | 'body' | 'manual'
  confidence: number
  confirmation: 'confirmed' | 'rejected' | null
  annotation: string
}

export interface RegionScores {
  face: number
  mouth: number
  hands: number
  body: number
}

export interface SeverityDetail {
  composite: number
  frequency_score: number
  intensity_score: number
  repetitiveness_score: number
  variety_score: number
  region_scores: RegionScores
}

export interface SessionDetail {
  session_id: string
  started_at: string
  completed_at: string | null
  status: 'active' | 'completed'
  severity_score: number | null
  severity_detail: SeverityDetail | null
  events: TicEventRecord[]
  confirmed_count: number
  rejected_count: number
  has_video: boolean
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return api.get<SessionDetail>(`${BASE}/${sessionId}`)
}

export async function confirmEvent(
  sessionId: string,
  eventIndex: number,
  status: 'confirmed' | 'rejected',
  annotation?: string,
): Promise<void> {
  await api.post<void>(`${BASE}/${sessionId}/events/${eventIndex}/confirmation`, {
    status,
    annotation: annotation ?? '',
  })
}

export async function bulkConfirmEvents(
  sessionId: string,
  confirmations: Array<{ event_index: number; status: 'confirmed' | 'rejected'; annotation?: string }>,
): Promise<void> {
  await api.post<void>(`${BASE}/${sessionId}/events/bulk-confirmation`, {
    confirmations: confirmations.map((c) => ({ ...c, annotation: c.annotation ?? '' })),
  })
}
