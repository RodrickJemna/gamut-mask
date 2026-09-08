/**
 * Renders the wheel and the current mask to an offscreen canvas, for embedding in the
 * PDF. Spec: D43.
 *
 * The on-screen wheel is a canvas with an SVG overlay on top (D4), and there is no way to
 * flatten those two into one bitmap without either serialising the SVG or redrawing it.
 * Serialising loses the overlay entirely, because its colours come from CSS custom
 * properties which do not resolve once the SVG is detached from the document — a failure
 * that would have looked like "the mask outline vanished in the PDF". So the overlay is
 * redrawn here with the same geometry, against explicit print colours.
 *
 * Print colours, not screen colours: the sheet is white paper, so the anchor rays and
 * letters are dark rather than the light ink used against the app's grey chrome.
 */

import { renderDisk } from '../color/render.ts'
import { ANCHORS, dir, polar, type Point } from '../color/wheel.ts'

/** Matches VIEW_MARGIN in MaskOverlay — room outside the disk for the anchor letters. */
const VIEW_MARGIN = 1.2

const INK = '#1a1a1a'
const RAY = 'rgba(0, 0, 0, 0.22)'
const OUTLINE = '#000000'
const WASH = 'rgba(0, 0, 0, 0.5)'

export type WheelImage = {
  jpeg: Uint8Array
  width: number
  height: number
  /**
   * The canvas the JPEG was encoded from. The JPEG export draws this directly rather
   * than decoding the bytes back, which would be asynchronous; both exports therefore
   * show the same pixels.
   */
  canvas: HTMLCanvasElement
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * `side` is the pixel size of the square image. The disk occupies the middle
 * `1 / VIEW_MARGIN` of it, leaving the same margin the on-screen overlay uses.
 */
export function renderWheelImage(polygon: Point[], side = 1100): WheelImage {
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  // JPEG has no alpha, so the transparent area outside the disk must be composited onto
  // paper white here rather than arriving as black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, side, side)

  const diskSide = Math.round(side / VIEW_MARGIN)
  const inset = Math.round((side - diskSide) / 2)

  // The disk itself, reusing the app's renderer so the PDF cannot drift from the screen.
  const disk = document.createElement('canvas')
  disk.width = diskSide
  disk.height = diskSide
  const diskCtx = disk.getContext('2d')
  if (!diskCtx) throw new Error('2D canvas context unavailable')
  diskCtx.putImageData(renderDisk(diskSide, 1), 0, 0)
  ctx.drawImage(disk, inset, inset)

  const unit = diskSide / 2
  const cx = side / 2
  const cy = side / 2
  const toPx = (p: Point) => ({ x: cx + p.x * unit, y: cy + p.y * unit })

  const tracePolygon = () => {
    ctx.beginPath()
    polygon.forEach((p, i) => {
      const q = toPx(p)
      if (i === 0) ctx.moveTo(q.x, q.y)
      else ctx.lineTo(q.x, q.y)
    })
    ctx.closePath()
  }

  // D28: outside the mask is dimmed, not cut away. Same even-odd construction as the
  // overlay — disk subpath then mask subpath — so the print matches the screen.
  if (polygon.length >= 3) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, unit, 0, Math.PI * 2)
    polygon.forEach((p, i) => {
      const q = toPx(p)
      if (i === 0) ctx.moveTo(q.x, q.y)
      else ctx.lineTo(q.x, q.y)
    })
    ctx.closePath()
    ctx.fillStyle = WASH
    ctx.fill('evenodd')
    ctx.restore()
  }

  // F3/D34: the six anchors, always drawn.
  ctx.lineWidth = Math.max(1, side / 900)
  ctx.strokeStyle = RAY
  for (const anchor of ANCHORS) {
    const end = toPx(dir(anchor.angle))
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
  }

  ctx.fillStyle = INK
  ctx.font = `600 ${Math.round(side * 0.032)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const anchor of ANCHORS) {
    const at = toPx(polar(anchor.angle, 1.09))
    ctx.fillText(anchor.letter, at.x, at.y)
  }

  if (polygon.length >= 3) {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = Math.max(1.5, side / 550)
    tracePolygon()
    ctx.stroke()
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  return {
    jpeg: base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1)),
    width: side,
    height: side,
    canvas,
  }
}
