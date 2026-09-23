import type { Rect } from "../shared/crop-math";
import { OVERLAY_CSS } from "./styles";

const MIN_SIZE = 8;

/**
 * Lets the user drag a rectangle over the viewport. Resolves with the rectangle in viewport
 * CSS pixels once the overlay is gone from the screen, or `null` on Esc or a tiny selection.
 */
export function selectArea(): Promise<Rect | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.style.cssText =
      "all: initial; position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair; background: rgba(0,0,0,0.15);";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="box" hidden><span class="size"></span></div>`;
    const box = root.querySelector<HTMLDivElement>(".box")!;
    const sizeLabel = root.querySelector<HTMLSpanElement>(".size")!;

    let start: { x: number; y: number } | null = null;
    let current: Rect | null = null;

    const rectFrom = (e: MouseEvent): Rect => {
      const x = Math.min(Math.max(e.clientX, 0), innerWidth);
      const y = Math.min(Math.max(e.clientY, 0), innerHeight);
      const origin = start ?? { x, y };
      return {
        x: Math.min(origin.x, x),
        y: Math.min(origin.y, y),
        width: Math.abs(x - origin.x),
        height: Math.abs(y - origin.y),
      };
    };

    const draw = (rect: Rect) => {
      box.hidden = false;
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.classList.toggle("near-top", rect.y < 28);
      sizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    };

    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      swallow(e);
      start = { x: e.clientX, y: e.clientY };
      // The box's shadow now dims everything outside the selection.
      host.style.background = "transparent";
      current = rectFrom(e);
      draw(current);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!start) return;
      swallow(e);
      current = rectFrom(e);
      draw(current);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!start) return;
      swallow(e);
      const rect = rectFrom(e);
      finish(rect.width >= MIN_SIZE && rect.height >= MIN_SIZE ? rect : null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      swallow(e);
      if (e.key === "Escape") finish(null);
    };

    const finish = (rect: Rect | null) => {
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("keydown", onKeyDown, true);
      host.remove();
      if (!rect) {
        resolve(null);
        return;
      }
      // Two frames: the first commits the removal, the second guarantees it was painted.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(rect)));
    };

    host.addEventListener("mousedown", onMouseDown);
    host.addEventListener("click", swallow);
    host.addEventListener("contextmenu", (e) => {
      swallow(e);
      finish(null);
    });
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("keydown", onKeyDown, true);
    document.documentElement.appendChild(host);
  });
}
