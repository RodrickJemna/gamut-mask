/**
 * Canvas implementations of `Surface`, for the JPEG export. Spec: D45.
 *
 * Two of them:
 *
 *  - `CanvasSurface` draws for real, scaling points to pixels.
 *  - `MeasuringSurface` draws nothing but measures text, so the layout can be run once
 *    to discover how tall the sheet is before the canvas is created. A canvas needs its
 *    height up front, and the JPEG is one continuous sheet rather than paginated, so the
 *    height is not known until the layout has run.
 */

import type { Surface, TextStyle } from './surface.ts'

/**
 * Helvetica is what the PDF uses; Arial is metrically compatible and is what a Mac
 * actually has. The stack matters — a fallback with different metrics would shift every
 * right-aligned number.
 */
const FONT_STACK = 'Helvetica, Arial, "Liberation Sans", sans-serif'

function fontFor(size: number, bold: boolean): string {
  return `${bold ? '600 ' : ''}${size}px ${FONT_STACK}`
}

export class CanvasSurface implements Surface {
  private readonly ctx: CanvasRenderingContext2D
  private readonly scale: number

  constructor(ctx: CanvasRenderingContext2D, scale: number) {
    this.ctx = ctx
    this.scale = scale
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }

  /** The image drawn by `image()`, set by the caller before layout runs. */
  sheetImage: CanvasImageSource | null = null

  rect(x: number, top: number, w: number, h: number, hex: string): void {
    this.ctx.fillStyle = hex
    this.ctx.fillRect(x * this.scale, top * this.scale, w * this.scale, h * this.scale)
  }

  strokeRect(
    x: number, top: number, w: number, h: number, hex: string, lineWidth = 0.5,
  ): void {
    this.ctx.strokeStyle = hex
    this.ctx.lineWidth = Math.max(1, lineWidth * this.scale)
    this.ctx.strokeRect(x * this.scale, top * this.scale, w * this.scale, h * this.scale)
  }

  line(
    x1: number, top1: number, x2: number, top2: number, hex: string, lineWidth = 0.5,
  ): void {
    this.ctx.strokeStyle = hex
    this.ctx.lineWidth = Math.max(1, lineWidth * this.scale)
    this.ctx.beginPath()
    this.ctx.moveTo(x1 * this.scale, top1 * this.scale)
    this.ctx.lineTo(x2 * this.scale, top2 * this.scale)
    this.ctx.stroke()
  }

  text(x: number, top: number, value: string, style: TextStyle = {}): void {
    const size = style.size ?? 9
    this.ctx.font = fontFor(size * this.scale, style.bold ?? false)
    this.ctx.fillStyle = style.hex ?? '#000000'
    this.ctx.fillText(value, x * this.scale, top * this.scale)
  }

  image(x: number, top: number, w: number, h: number): void {
    if (!this.sheetImage) return
    this.ctx.drawImage(
      this.sheetImage,
      x * this.scale, top * this.scale, w * this.scale, h * this.scale,
    )
  }

  measure(value: string, size: number, bold = false): number {
    this.ctx.font = fontFor(size * this.scale, bold)
    return this.ctx.measureText(value).width / this.scale
  }
}

/** Measures only. Used for the sizing pass; every drawing call is a no-op. */
export class MeasuringSurface implements Surface {
  private readonly ctx: CanvasRenderingContext2D

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  rect(): void {}
  strokeRect(): void {}
  line(): void {}
  text(): void {}
  image(): void {}

  measure(value: string, size: number, bold = false): number {
    this.ctx.font = fontFor(size, bold)
    return this.ctx.measureText(value).width
  }
}
