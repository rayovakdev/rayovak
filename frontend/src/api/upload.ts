const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface UploadResponse {
  session_id: string
  filename: string
  size_bytes: number
}

export function uploadVideo(
  file: File,
  onProgress: (pct: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE_URL}/api/v1/video_analysis/upload`)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 202) {
        resolve(JSON.parse(xhr.responseText) as UploadResponse)
      } else {
        let detail = xhr.statusText
        try {
          detail = (JSON.parse(xhr.responseText) as { detail: string }).detail
        } catch {
          // use statusText fallback
        }
        reject(new Error(`Upload failed (${xhr.status}): ${detail}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

    xhr.send(form)
  })
}
