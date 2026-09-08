/**
 * Hands a generated file to the browser's download flow. Spec: D43.
 *
 * This is the only file-writing mechanism available to the app. A page cannot create a
 * folder beside itself and write into it — there is no such API, and the File System
 * Access API that comes closest needs a user-granted directory handle, is absent in
 * Safari, and is unavailable on file:// origins anyway. So sheets land wherever the
 * browser puts downloads.
 */

export function downloadFile(bytes: Uint8Array, fileName: string, mime: string): void {
  // Copy into a fresh buffer: a Uint8Array view over a larger buffer would otherwise
  // hand the whole buffer to Blob.
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking synchronously can cancel the download before it starts in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
