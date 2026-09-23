import type { Rect, Size } from "../shared/crop-math";
import { dataUrlMime, extensionFor } from "../shared/data-url";
import { randomId } from "../shared/ids";
import type { IssueMeta } from "../shared/issue-body";
import type { CaptureContext, GetLabelsResponse, Label, TargetChoice } from "../shared/messages";
import { repoKey } from "../shared/site-mapping";
import { send } from "./send";
import { FORM_CSS } from "./styles";

export interface IssueFormOptions {
  context: CaptureContext;
  screenshotDataUrl: string;
  rect: Rect;
  viewport: Size;
  dpr: number;
  /** Labels requested for `context.target` while the user was selecting. */
  prefetchedLabels: Promise<GetLabelsResponse> | null;
}

const PANEL_WIDTH = 380;
const GAP = 12;
const TOAST_MS = 8000;

/** Opens the issue form; resolves once it (or its success toast) is closed. */
export function openIssueForm(options: IssueFormOptions): Promise<void> {
  return new Promise((resolve) => new IssueForm(options, resolve).mount());
}

function createShadowHost(): { host: HTMLDivElement; root: ShadowRoot } {
  const host = document.createElement("div");
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = FORM_CSS;
  root.append(style);
  return { host, root };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function code(text: string): HTMLElement {
  return el("code", { textContent: text });
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", { type: "button", className, textContent: text });
  node.addEventListener("click", onClick);
  return node;
}

/** Keeps the page's own keyboard shortcuts from firing while the user types in our UI. */
function isolateKeyboard(root: ShadowRoot, onKeyDown?: (e: KeyboardEvent) => void): void {
  root.addEventListener("keydown", (e) => {
    const event = e as KeyboardEvent;
    event.stopPropagation();
    onKeyDown?.(event);
  });
  for (const type of ["keyup", "keypress"]) root.addEventListener(type, (e) => e.stopPropagation());
}

class IssueForm {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly submissionId = randomId(16);
  private target: TargetChoice | null;
  private targetManuallyChosen = false;
  private choices: TargetChoice[];
  private labels: Label[] = [];
  private selected = new Set<string>();
  private labelsFor = "";
  private busy = false;
  private changingTarget = false;
  private mappingFormOpen = false;

  private readonly panel = el("div", { className: "panel" });
  private readonly targetBox = el("div");
  private readonly titleInput = el("input", { type: "text", maxLength: 256, placeholder: "What's wrong?" });
  private readonly descriptionInput = el("textarea", { rows: 5, placeholder: "Details, steps to reproduce… (Markdown)" });
  private readonly labelFilter = el("input", { type: "search", placeholder: "Filter labels" });
  private readonly labelList = el("div", { className: "label-list" });
  private readonly labelCount = el("span", { className: "muted" });
  private readonly errorBox = el("div", { className: "error", hidden: true });
  private readonly downloadButton = button("Download screenshot", "btn", () => this.download());
  private readonly cancelButton = button("Cancel", "btn", () => this.cancel());
  private readonly submitButton = button("Submit", "btn primary", () => void this.submit());
  private readonly lightbox = el("div", { className: "lightbox", hidden: true });

  constructor(
    private readonly options: IssueFormOptions,
    private readonly onClosed: () => void,
  ) {
    ({ host: this.host, root: this.root } = createShadowHost());
    this.target = options.context.target;
    this.choices = options.context.choices;
  }

  mount(): void {
    const { screenshotDataUrl } = this.options;
    const thumb = el("button", { type: "button", className: "thumb", title: "View larger" }, el("img", { src: screenshotDataUrl, alt: "Screenshot" }));
    thumb.addEventListener("click", () => (this.lightbox.hidden = false));
    this.lightbox.append(el("img", { src: screenshotDataUrl, alt: "Screenshot" }));
    this.lightbox.addEventListener("click", () => (this.lightbox.hidden = true));

    this.titleInput.required = true;
    this.labelFilter.addEventListener("input", () => this.renderLabels());
    this.downloadButton.hidden = true;

    this.panel.append(
      this.targetBox,
      thumb,
      el("label", { className: "field" }, "Title", this.titleInput),
      el("label", { className: "field" }, "Description", this.descriptionInput),
      el("div", { className: "labels" }, el("div", { className: "labels-head" }, "Labels", this.labelCount), this.labelFilter, this.labelList),
      this.errorBox,
      el("div", { className: "actions" }, this.downloadButton, el("span", { className: "spacer" }), this.cancelButton, this.submitButton),
    );
    this.root.append(this.panel, this.lightbox);

    isolateKeyboard(this.root, (e) => this.onKeyDown(e));
    document.documentElement.appendChild(this.host);
    this.renderTarget();
    this.updateSubmitState();
    if (this.target) void this.loadLabels(this.target, this.options.prefetchedLabels);
    else this.renderLabels();
    this.position();
    // The panel grows as labels load or the mapping form opens; keep it inside the viewport.
    new ResizeObserver(() => this.position()).observe(this.panel);
    this.titleInput.focus();
  }

  private position(): void {
    const { rect } = this.options;
    const right = rect.x + rect.width + GAP;
    let left: number | null = null;
    if (right + PANEL_WIDTH + GAP <= innerWidth) left = right;
    else if (rect.x - GAP - PANEL_WIDTH >= GAP) left = rect.x - GAP - PANEL_WIDTH;
    if (left === null) {
      this.panel.classList.add("centered");
      return;
    }
    this.panel.style.left = `${left}px`;
    const height = this.panel.getBoundingClientRect().height;
    this.panel.style.top = `${Math.max(GAP, Math.min(rect.y, innerHeight - height - GAP))}px`;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      if (!this.lightbox.hidden) this.lightbox.hidden = true;
      else this.cancel();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void this.submit();
    }
  }

  // Target repo

  private renderTarget(): void {
    const box = this.targetBox;
    box.replaceChildren();
    if (this.target && !this.changingTarget) {
      box.className = "target";
      const where = this.targetManuallyChosen ? "chosen for this issue" : `matched ${this.target.pattern}`;
      box.append(el("span", { className: "arrow" }, "→ ", code(`${this.target.owner}/${this.target.repo}`)), el("span", { className: "muted", textContent: where }));
      if (this.choices.length > 1) {
        box.append(
          button("Change", "link", () => {
            this.changingTarget = true;
            this.renderTarget();
          }),
        );
      }
      return;
    }
    if (this.target && this.changingTarget) {
      box.className = "target";
      const select = this.repoSelect(this.target);
      box.append(el("span", { className: "arrow", textContent: "→" }), select);
      select.focus();
      return;
    }

    box.className = "notice";
    const { hostname } = this.options.context;
    box.append(el("div", {}, "No repo mapped for ", hostname ? code(hostname) : "this page"));
    if (this.mappingFormOpen) {
      box.append(this.mappingForm());
      return;
    }
    const row = el("div", { className: "row" });
    if (this.choices.length) row.append(this.repoSelect(null));
    const mapButton = button("Map this site", "btn", () => {
      this.mappingFormOpen = true;
      this.renderTarget();
    });
    mapButton.disabled = !hostname;
    row.append(mapButton);
    box.append(row);
  }

  private repoSelect(current: TargetChoice | null): HTMLSelectElement {
    const select = el("select");
    if (!current) select.append(el("option", { value: "", textContent: "Send to…" }));
    this.choices.forEach((choice, index) => {
      const option = el("option", { value: String(index), textContent: `${choice.owner}/${choice.repo}` });
      option.selected = !!current && repoKey(choice.owner, choice.repo) === repoKey(current.owner, current.repo);
      select.append(option);
    });
    select.addEventListener("change", () => {
      const choice = this.choices[Number(select.value)];
      if (!select.value || !choice) return;
      this.changingTarget = false;
      this.targetManuallyChosen = true;
      this.setTarget(choice);
    });
    return select;
  }

  private mappingForm(): HTMLElement {
    const { hostname, defaultOwner } = this.options.context;
    const pattern = el("input", { type: "text", value: hostname });
    const owner = el("input", { type: "text", value: defaultOwner });
    const repo = el("input", { type: "text", placeholder: "repo-name" });
    const error = el("div", { className: "error", hidden: true });
    const save = button("Save mapping", "btn primary", async () => {
      save.disabled = true;
      const response = await send({ type: "add-mapping", pattern: pattern.value, repo: repo.value, owner: owner.value });
      save.disabled = false;
      if (!response.ok) {
        error.textContent = response.error;
        error.hidden = false;
        return;
      }
      this.mappingFormOpen = false;
      this.choices = response.context.choices;
      if (response.context.target) this.setTarget(response.context.target);
    });
    const cancel = button("Cancel", "btn", () => {
      this.mappingFormOpen = false;
      this.renderTarget();
    });
    const form = el(
      "div",
      { className: "mini-form" },
      el("span", { textContent: "Pattern" }),
      pattern,
      el("span", { textContent: "Owner" }),
      owner,
      el("span", { textContent: "Repo" }),
      repo,
      el("div", { className: "actions" }, cancel, save),
    );
    const wrapper = el("div", {}, form, error);
    queueMicrotask(() => repo.focus());
    return wrapper;
  }

  private setTarget(choice: TargetChoice): void {
    this.target = choice;
    this.renderTarget();
    this.updateSubmitState();
    void this.loadLabels(choice, null);
  }

  // Labels

  private async loadLabels(target: TargetChoice, prefetched: Promise<GetLabelsResponse> | null): Promise<void> {
    const key = repoKey(target.owner, target.repo);
    this.labelsFor = key;
    this.labels = [];
    this.selected.clear();
    this.labelList.replaceChildren(el("div", { className: "muted", textContent: "Loading labels…" }));
    this.labelCount.textContent = "";
    const response = await (prefetched ?? send({ type: "get-labels", owner: target.owner, repo: target.repo }));
    if (this.labelsFor !== key) return;
    if (!response.ok) {
      this.labelList.replaceChildren(el("div", { className: "muted", textContent: `Couldn't load labels: ${response.error}` }));
      return;
    }
    this.labels = response.labels;
    this.selected = new Set(response.preselected);
    this.renderLabels();
  }

  private renderLabels(): void {
    if (!this.target) {
      this.labelList.replaceChildren(el("div", { className: "muted", textContent: "Choose a repo first." }));
      return;
    }
    const filter = this.labelFilter.value.trim().toLowerCase();
    const visible = this.labels.filter((l) => !filter || l.name.toLowerCase().includes(filter));
    this.labelCount.textContent = this.selected.size ? `${this.selected.size} selected` : "";
    if (!this.labels.length) {
      this.labelList.replaceChildren(el("div", { className: "muted", textContent: "This repo has no labels." }));
      return;
    }
    if (!visible.length) {
      this.labelList.replaceChildren(el("div", { className: "muted", textContent: "No label matches." }));
      return;
    }
    this.labelList.replaceChildren(
      ...visible.map((label) => {
        const checkbox = el("input", { type: "checkbox", checked: this.selected.has(label.name), disabled: this.busy });
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selected.add(label.name);
          else this.selected.delete(label.name);
          this.labelCount.textContent = this.selected.size ? `${this.selected.size} selected` : "";
        });
        const swatch = el("span", { className: "swatch" });
        if (/^[0-9a-f]{6}$/i.test(label.color)) swatch.style.background = `#${label.color}`;
        return el("label", { className: "label-item", title: label.description ?? "" }, checkbox, swatch, label.name);
      }),
    );
  }

  // Submit / cancel

  private updateSubmitState(): void {
    this.submitButton.disabled = this.busy || !this.target;
    this.cancelButton.disabled = this.busy;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    for (const input of [this.titleInput, this.descriptionInput, this.labelFilter]) input.disabled = busy;
    for (const box of this.labelList.querySelectorAll("input")) box.disabled = busy;
    this.updateSubmitState();
  }

  private showError(message: string): void {
    this.errorBox.textContent = message;
    this.errorBox.hidden = false;
  }

  private async submit(): Promise<void> {
    if (this.busy || !this.target) return;
    const title = this.titleInput.value.trim();
    if (!title) {
      this.showError("A title is required.");
      this.titleInput.focus();
      return;
    }
    const { owner, repo } = this.target;
    const meta: IssueMeta = {
      url: location.href,
      pageTitle: document.title,
      userAgent: navigator.userAgent,
      viewport: this.options.viewport,
      dpr: this.options.dpr,
      timestamp: new Date().toISOString(),
    };
    this.errorBox.hidden = true;
    this.setBusy(true);
    this.submitButton.replaceChildren(el("span", { className: "spinner" }), "Submitting…");
    const response = await send({
      type: "submit-issue",
      submissionId: this.submissionId,
      owner,
      repo,
      title,
      description: this.descriptionInput.value,
      labels: [...this.selected],
      screenshotDataUrl: this.options.screenshotDataUrl,
      meta,
    });
    this.setBusy(false);
    if (response.ok) {
      this.showSuccess(response.number, response.htmlUrl, response.fellBack);
      return;
    }
    this.submitButton.replaceChildren("Retry");
    this.downloadButton.hidden = false;
    this.showError(response.error);
    // Disabling the inputs moved focus to the page; bring it back so Esc and Ctrl+Enter work.
    this.submitButton.focus();
  }

  private cancel(): void {
    if (this.busy) return;
    const dirty = this.titleInput.value.trim() || this.descriptionInput.value.trim();
    if (dirty && !window.confirm("Discard this issue?")) return;
    this.close();
  }

  private close(): void {
    this.host.remove();
    this.onClosed();
  }

  private download(): void {
    const extension = extensionFor(dataUrlMime(this.options.screenshotDataUrl));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const link = el("a", { href: this.options.screenshotDataUrl, download: `bugpicker-${stamp}.${extension}` });
    this.root.append(link);
    link.click();
    link.remove();
  }

  private showSuccess(number: number, url: string, fellBack: boolean): void {
    const link = el("a", { href: url, target: "_blank", rel: "noopener noreferrer", textContent: url.replace(/^https:\/\/github\.com\//, "") });
    const copy = button("Copy link", "btn", async () => {
      copy.textContent = (await copyText(url, this.root)) ? "Copied" : "Copy failed";
    });
    const toast = el(
      "div",
      { className: "toast", role: "status" },
      el("div", { className: "title", textContent: `Issue #${number} created` }),
      link,
    );
    if (fellBack) toast.append(el("div", { className: "muted", textContent: "Uploaded via branch fallback" }));
    toast.append(el("div", { className: "actions" }, copy, button("Close", "btn", () => this.close())));
    this.panel.remove();
    this.lightbox.remove();
    this.root.append(toast);
    autoClose(toast, () => this.close());
  }
}

function autoClose(toast: HTMLElement, close: () => void): void {
  let timer = setTimeout(close, TOAST_MS);
  toast.addEventListener("mouseenter", () => clearTimeout(timer));
  toast.addEventListener("mouseleave", () => {
    clearTimeout(timer);
    timer = setTimeout(close, TOAST_MS);
  });
}

async function copyText(text: string, root: ShadowRoot): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    const area = el("textarea", { value: text });
    area.style.cssText = "position: fixed; opacity: 0;";
    root.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** A short-lived message, used when capture fails before the form can open. */
export function showToast(message: string): void {
  const { host, root } = createShadowHost();
  const toast = el("div", { className: "toast error-toast", role: "alert" }, el("div", { className: "title", textContent: "BugPicker" }), message);
  root.append(toast);
  isolateKeyboard(root);
  document.documentElement.appendChild(host);
  autoClose(toast, () => host.remove());
}
