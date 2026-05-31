import { getTask00OptionsPlaceholders } from "../core/task00";

export function OptionsApp() {
  const placeholders = getTask00OptionsPlaceholders();

  return (
    <main className="app-shell app-shell--options">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          LA
        </div>
        <div>
          <h1>Local AI Chat Exporter</h1>
          <p className="muted">Settings placeholders for the Task 00 scaffold.</p>
        </div>
      </header>

      <section className="settings-list" aria-label="Settings placeholders">
        {placeholders.map((placeholder) => (
          <article className="setting-row" key={placeholder.label}>
            <h2>{placeholder.label}</h2>
            <p>{placeholder.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
