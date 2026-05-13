import { api } from './client'

const BASE = '/api/v1/video_analysis/sessions'

export interface TicEventPayload {
  timestamp: string
  tic_type: 'mouth' | 'hand' | 'face' | 'body'
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
}

export async function listSessions(): Promise<SessionSummary[]> {
  return api.get<SessionSummary[]>(BASE)
}

export interface TicEventRecord {
  timestamp: string
  tic_type: 'mouth' | 'hand' | 'face' | 'body'
  confidence: number
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
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return api.get<SessionDetail>(`${BASE}/${sessionId}`)
}
