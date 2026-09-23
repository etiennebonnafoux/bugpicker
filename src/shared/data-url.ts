export type ImageMime = "image/png" | "image/jpeg";

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg));base64,[A-Za-z0-9+/]+=*$/;

export function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && IMAGE_DATA_URL.test(value);
}

export function dataUrlMime(dataUrl: string): ImageMime {
  return dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";
}

export function dataUrlBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export function extensionFor(mime: ImageMime): string {
  return mime === "image/jpeg" ? "jpg" : "png";
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}
