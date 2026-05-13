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
