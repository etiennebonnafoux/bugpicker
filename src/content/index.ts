import { isStartCaptureMessage, type CaptureContext, type GetLabelsResponse } from "../shared/messages";
import { openIssueForm, showToast } from "./form";
import { selectArea } from "./overlay";
import { send } from "./send";

declare global {
  interface Window {
    __bugPickerLoaded?: boolean;
  }
}

// The script is injected on every capture; only the first injection registers a listener.
if (!window.__bugPickerLoaded) {
  window.__bugPickerLoaded = true;
  let active = false;
  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    if (!isStartCaptureMessage(raw)) return;
    // Answer right away so the service worker's sendMessage settles without an error.
    sendResponse({ ok: true });
    if (active) return;
    active = true;
    runCapture(raw.context)
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : String(error)))
      .finally(() => (active = false));
  });
}

async function runCapture(context: CaptureContext): Promise<void> {
  // Start loading labels while the user is still selecting.
  const prefetchedLabels: Promise<GetLabelsResponse> | null = context.target
    ? send({ type: "get-labels", owner: context.target.owner, repo: context.target.repo })
    : null;

  const rect = await selectArea();
  if (!rect) return;
  const viewport = { width: innerWidth, height: innerHeight };
  const dpr = devicePixelRatio;
  const capture = await send({ type: "capture-area", rect, dpr, viewport });
  if (!capture.ok) {
    showToast(capture.error);
    return;
  }
  await openIssueForm({ context, screenshotDataUrl: capture.dataUrl, rect, viewport, dpr, prefetchedLabels });
}
