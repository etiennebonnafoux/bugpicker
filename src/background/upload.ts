import { dataUrlBase64, dataUrlMime, extensionFor } from "../shared/data-url";
import type { Settings } from "../shared/settings";
import { uploadViaBranch } from "./upload-branch";
import { uploadViaWeb } from "./upload-web";

export interface UploadResult {
  url: string;
  strategyUsed: "web" | "branch";
  fellBack: boolean;
}

export async function uploadScreenshot(
  settings: Settings,
  owner: string,
  repo: string,
  dataUrl: string,
): Promise<UploadResult> {
  const mime = dataUrlMime(dataUrl);
  const extension = extensionFor(mime);
  const web = () =>
    uploadViaWeb(settings.token, owner, repo, { filename: `screenshot-${Date.now()}.${extension}`, contentType: mime, dataUrl });
  const branch = () =>
    uploadViaBranch(settings.token, owner, repo, settings.screenshotBranch, { base64: dataUrlBase64(dataUrl), extension });

  switch (settings.uploadStrategy) {
    case "web":
      return { url: await web(), strategyUsed: "web", fellBack: false };
    case "branch":
      return { url: await branch(), strategyUsed: "branch", fellBack: false };
    default:
      try {
        return { url: await web(), strategyUsed: "web", fellBack: false };
      } catch (error) {
        console.warn("[BugPicker] web upload failed, falling back to the screenshot branch:", error);
        return { url: await branch(), strategyUsed: "branch", fellBack: true };
      }
  }
}
