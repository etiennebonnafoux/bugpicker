export const OVERLAY_CSS = `
:host { all: initial; }
.box {
  position: fixed;
  box-sizing: border-box;
  outline: 2px solid #0969da;
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.15);
  pointer-events: none;
}
.box[hidden] { display: none; }
.size {
  position: absolute;
  top: -24px;
  left: -2px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #0969da;
  color: #fff;
  font: 12px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  white-space: nowrap;
}
.box.near-top .size { top: 4px; left: 4px; }
`;

export const FORM_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.panel, .toast {
  position: fixed;
  z-index: 2147483647;
  color: #1f2328;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(31, 35, 40, 0.25);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  text-align: left;
}
.panel {
  width: 380px;
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel.centered { left: 50%; top: 50%; transform: translate(-50%, -50%); }
code { font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f6f8fa; padding: 1px 4px; border-radius: 4px; }
.muted { color: #656d76; font-size: 12px; }
.target { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.target .arrow { font-weight: 600; }
.notice { padding: 8px 10px; background: #fff8c5; border: 1px solid #d4a72c66; border-radius: 6px; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 8px; align-items: center; }
.row > * { flex: 1; min-width: 0; }
.mini-form { display: grid; grid-template-columns: auto 1fr; gap: 6px 8px; align-items: center; }
.mini-form .actions { grid-column: 1 / -1; }
.link { background: none; border: 0; padding: 0; color: #0969da; cursor: pointer; font: inherit; }
.link:hover { text-decoration: underline; }
label.field { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
input, textarea, select {
  font: 13px/1.4 inherit;
  font-family: inherit;
  color: inherit;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 5px 8px;
  width: 100%;
  font-weight: 400;
}
input:focus, textarea:focus, select:focus { outline: 2px solid #0969da; outline-offset: -1px; border-color: #0969da; }
textarea { resize: vertical; min-height: 80px; }
.thumb { display: block; padding: 0; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; cursor: zoom-in; overflow: hidden; }
.thumb img { display: block; max-width: 100%; max-height: 160px; margin: 0 auto; }
.labels { display: flex; flex-direction: column; gap: 4px; }
.labels-head { display: flex; justify-content: space-between; font-weight: 600; }
.label-list { max-height: 150px; overflow: auto; border: 1px solid #d0d7de; border-radius: 6px; padding: 4px; }
.label-item { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 4px; cursor: pointer; }
.label-item:hover { background: #f6f8fa; }
.label-item input { width: auto; margin: 0; }
.swatch { width: 12px; height: 12px; border-radius: 50%; flex: none; border: 1px solid rgba(0, 0, 0, 0.15); }
.error { color: #d1242f; background: #ffebe9; border: 1px solid #ff818266; border-radius: 6px; padding: 6px 8px; white-space: pre-wrap; }
.actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
.actions .spacer { flex: 1; }
button.btn {
  font: 600 13px/20px inherit;
  font-family: inherit;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
  color: #1f2328;
  cursor: pointer;
}
button.btn:hover:not(:disabled) { background: #eef1f4; }
button.btn.primary { background: #1f883d; border-color: #1a7f37; color: #fff; }
button.btn.primary:hover:not(:disabled) { background: #1a7f37; }
button:disabled { opacity: 0.55; cursor: default; }
.spinner {
  display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -1px;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.lightbox {
  position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center; cursor: zoom-out; padding: 24px;
}
.lightbox img { max-width: 100%; max-height: 100%; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); background: #fff; }
.toast { right: 16px; bottom: 16px; width: 340px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.toast .title { font-weight: 600; }
.toast.error-toast { border-color: #ff8182; }
.toast a { color: #0969da; }
`;
