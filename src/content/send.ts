import type { ContentRequest, ResponseFor } from "../shared/messages";

/** Sends a request to the service worker; transport failures come back as `{ ok: false }`. */
export async function send<M extends ContentRequest>(message: M): Promise<ResponseFor[M["type"]]> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as ResponseFor[M["type"]] | undefined;
    return response ?? ({ ok: false, error: "No response from the extension." } as ResponseFor[M["type"]]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Extension error: ${reason}. Reload the page and try again.` } as ResponseFor[M["type"]];
  }
}
