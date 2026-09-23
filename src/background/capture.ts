import { toDeviceRect, type Rect, type Size } from "../shared/crop-math";
import { blobToDataUrl } from "../shared/data-url";

const MAX_PNG_BYTES = 5 * 1024 * 1024;

/** Captures the visible viewport of `windowId` and returns the selection as a data URL. */
export async function captureArea(windowId: number, rect: Rect, viewport: Size, dpr: number): Promise<string> {
  const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const bitmap = await createImageBitmap(await (await fetch(screenshot)).blob());
  try {
    const crop = toDeviceRect(rect, viewport, bitmap, dpr);
    if (crop.width < 1 || crop.height < 1) throw new Error("The selection is outside the visible page.");
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a drawing context.");
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    let blob = await canvas.convertToBlob({ type: "image/png" });
    if (blob.size > MAX_PNG_BYTES) blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    return await blobToDataUrl(blob);
  } finally {
    bitmap.close();
  }
}
