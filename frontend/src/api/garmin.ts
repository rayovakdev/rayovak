import { api } from './client'

const BASE = '/api/v1/health_data/garmin'

export interface GarminStatus {
  connected: boolean
  last_auth_at: string | null
  display_name: string | null
}

export async function getGarminStatus(): Promise<GarminStatus> {
  return api.get<GarminStatus>(`${BASE}/status`)
}

export async function connectGarmin(): Promise<GarminStatus> {
  return api.post<GarminStatus>(`${BASE}/connect`, {})
}

export async function disconnectGarmin(): Promise<GarminStatus> {
  return api.post<GarminStatus>(`${BASE}/disconnect`, {})
}
