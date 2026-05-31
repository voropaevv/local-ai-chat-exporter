import { getTask00PopupState } from "../core/task00";

export function PopupApp() {
  const state = getTask00PopupState();

  return (
    <main className="app-shell app-shell--popup">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          LA
        </div>
        <div>
          <h1>{state.extensionName}</h1>
          <p className="muted">Export the current chat locally.</p>
        </div>
      </header>

      <section className="status-panel" aria-labelledby="platform-status-title">
        <h2 id="platform-status-title">Platform status</h2>
        <p>{state.platformStatus}</p>
      </section>

      <button className="primary-action" type="button" disabled={!state.canScanConversation}>
        {state.scanButtonLabel}
      </button>

      <p className="privacy-note">{state.privacyNote}</p>
    </main>
  );
}
