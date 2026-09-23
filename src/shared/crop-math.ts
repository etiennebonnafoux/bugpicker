export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Converts a selection in viewport CSS pixels into a rectangle of the captured bitmap.
 * The scale comes from the bitmap itself rather than `devicePixelRatio`, which keeps the
 * crop right under browser zoom. Edges are rounded (not width/height) so adjacent
 * selections never gain or lose a pixel.
 */
export function toDeviceRect(rect: Rect, viewport: Size, bitmap: Size, dpr: number): Rect {
  const scale = viewport.width > 0 ? bitmap.width / viewport.width : dpr > 0 ? dpr : 1;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  const left = clamp(Math.round(rect.x * scale), bitmap.width);
  const top = clamp(Math.round(rect.y * scale), bitmap.height);
  const right = clamp(Math.round((rect.x + rect.width) * scale), bitmap.width);
  const bottom = clamp(Math.round((rect.y + rect.height) * scale), bitmap.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
