export const isVideoExportClientEnabled
  = process.env.NEXT_PUBLIC_ENABLE_VIDEO_EXPORT === 'true'

export function isVideoExportServerEnabled() {
  return process.env.ENABLE_VIDEO_EXPORT === 'true'
}
