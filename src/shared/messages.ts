import type { Rect, Size } from "./crop-math";
import { isImageDataUrl } from "./data-url";
import type { IssueMeta } from "./issue-body";

export interface TargetChoice {
  owner: string;
  repo: string;
  /** Pattern of the mapping this target comes from. */
  pattern: string;
}

export interface CaptureContext {
  target: TargetChoice | null;
  /** Every mapped repo, for "Change" and for unmapped sites. */
  choices: TargetChoice[];
  /** `host[:port]` of the page without `www.`; empty on non-http pages. */
  hostname: string;
  defaultOwner: string;
}

export interface Label {
  name: string;
  color: string;
  description: string | null;
}

// Service worker -> content script

export interface StartCaptureMessage {
  type: "start-capture";
  context: CaptureContext;
}

// Content script -> service worker

export interface CaptureAreaRequest {
  type: "capture-area";
  rect: Rect;
  dpr: number;
  viewport: Size;
}

export interface GetLabelsRequest {
  type: "get-labels";
  owner: string;
  repo: string;
}

export interface AddMappingRequest {
  type: "add-mapping";
  pattern: string;
  repo: string;
  owner: string;
}

export interface SubmitIssueRequest {
  type: "submit-issue";
  /** Stable across retries of the same form, so an uploaded image is reused. */
  submissionId: string;
  owner: string;
  repo: string;
  title: string;
  description: string;
  labels: string[];
  screenshotDataUrl: string;
  meta: IssueMeta;
}

export type ContentRequest = CaptureAreaRequest | GetLabelsRequest | AddMappingRequest | SubmitIssueRequest;

export interface Failure {
  ok: false;
  error: string;
}

export type CaptureAreaResponse = { ok: true; dataUrl: string } | Failure;
export type GetLabelsResponse = { ok: true; labels: Label[]; preselected: string[] } | Failure;
export type AddMappingResponse = { ok: true; context: CaptureContext } | Failure;
export type SubmitIssueResponse =
  | { ok: true; number: number; htmlUrl: string; strategyUsed: "web" | "branch"; fellBack: boolean }
  | Failure;

export interface ResponseFor {
  "capture-area": CaptureAreaResponse;
  "get-labels": GetLabelsResponse;
  "add-mapping": AddMappingResponse;
  "submit-issue": SubmitIssueResponse;
}

type Fields = Record<string, unknown>;

const isObject = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown, max = 1000): v is string => typeof v === "string" && v.length <= max;
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isSize = (v: unknown): v is Size => isObject(v) && isFiniteNumber(v.width) && isFiniteNumber(v.height);
const isRect = (v: unknown): v is Rect => isObject(v) && isSize(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y);
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every((s) => isString(s, 100));

function isMeta(v: unknown): v is IssueMeta {
  return (
    isObject(v) &&
    isString(v.url, 8192) &&
    isString(v.pageTitle, 4096) &&
    isString(v.userAgent) &&
    isSize(v.viewport) &&
    isFiniteNumber(v.dpr) &&
    isString(v.timestamp, 64)
  );
}

/** Returns the message if it is a well-formed content request, `null` otherwise. */
export function parseContentRequest(raw: unknown): ContentRequest | null {
  if (!isObject(raw)) return null;
  switch (raw.type) {
    case "capture-area":
      return isRect(raw.rect) && isFiniteNumber(raw.dpr) && isSize(raw.viewport) ? (raw as unknown as CaptureAreaRequest) : null;
    case "get-labels":
      return isString(raw.owner, 100) && isString(raw.repo, 100) ? (raw as unknown as GetLabelsRequest) : null;
    case "add-mapping":
      return isString(raw.pattern, 300) && isString(raw.repo, 100) && isString(raw.owner, 100)
        ? (raw as unknown as AddMappingRequest)
        : null;
    case "submit-issue":
      return isString(raw.submissionId, 64) &&
        isString(raw.owner, 100) &&
        isString(raw.repo, 100) &&
        isString(raw.title, 256) &&
        isString(raw.description, 65536) &&
        isStringList(raw.labels) &&
        isImageDataUrl(raw.screenshotDataUrl) &&
        isMeta(raw.meta)
        ? (raw as unknown as SubmitIssueRequest)
        : null;
    default:
      return null;
  }
}

export function isStartCaptureMessage(raw: unknown): raw is StartCaptureMessage {
  return isObject(raw) && raw.type === "start-capture" && isObject(raw.context);
}
