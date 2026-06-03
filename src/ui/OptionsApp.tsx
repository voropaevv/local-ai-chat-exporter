import { useEffect, useState } from "preact/hooks";

import {
  DEFAULT_REDACTION_SETTINGS,
  normalizeRedactionSettings,
  type RedactionPreset,
  type RedactionSettings
} from "../core/redaction";
import { BrandIcon } from "./components/BrandIcon";
import { PermissionExplainer } from "./components/PermissionExplainer";
import { PRIVACY_SUMMARY, PrivacyPanel } from "./components/PrivacyPanel";
import { readStoredRedactionSettings, writeStoredRedactionSettings } from "./redaction-storage";

export function OptionsApp() {
  const [copyStatus, setCopyStatus] = useState("Ready.");
  const [redaction, setRedaction] = useState<RedactionSettings>(DEFAULT_REDACTION_SETTINGS);
  const [saveStatus, setSaveStatus] = useState("Stored locally in browser storage.");

  useEffect(() => {
    let cancelled = false;

    readStoredRedactionSettings()
      .then((settings) => {
        if (!cancelled) {
          setRedaction(settings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSaveStatus("Storage is unavailable in this context.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateRedaction(next: RedactionSettings) {
    const normalized = normalizeRedactionSettings(next);
    setRedaction(normalized);
    setSaveStatus("Saving locally...");

    writeStoredRedactionSettings(normalized)
      .then(() => setSaveStatus("Saved locally."))
      .catch(() => setSaveStatus("Could not save settings in this context."));
  }

  async function handleCopyPrivacySummary() {
    try {
      await navigator.clipboard.writeText(PRIVACY_SUMMARY);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Clipboard is unavailable in this context.");
    }
  }

  return (
    <main className="app-shell app-shell--options">
      <header className="app-header">
        <BrandIcon />
        <div>
          <h1>Local AI Chat Exporter</h1>
          <p className="muted">Privacy controls and permission details.</p>
        </div>
      </header>

      <PrivacyPanel copyStatus={copyStatus} onCopyPrivacySummary={handleCopyPrivacySummary} />

      <section className="panel" aria-labelledby="redaction-title">
        <h2 id="redaction-title">Redaction</h2>
        <label className="field-row">
          <span>Preset</span>
          <select
            onChange={(event) =>
              updateRedaction({
                ...redaction,
                preset: event.currentTarget.value as RedactionPreset
              })
            }
            value={redaction.preset}
          >
            <option value="off">Off</option>
            <option value="basic">Basic: emails and phone numbers</option>
            <option value="strict">Strict: basic plus secrets</option>
            <option value="custom">Custom: basic plus regex list</option>
          </select>
        </label>
        <label className="field-row">
          <span>Custom regex list</span>
          <textarea
            aria-describedby="custom-regex-note"
            disabled={redaction.preset !== "custom"}
            onInput={(event) =>
              updateRedaction({
                ...redaction,
                customPatterns: event.currentTarget.value.split("\n")
              })
            }
            rows={5}
            value={redaction.customPatterns.join("\n")}
          />
        </label>
        <p className="muted" id="custom-regex-note">
          One JavaScript regex per line. Matches use [REDACTED_SECRET].
        </p>
        <p className="status-text" role="status">
          {saveStatus}
        </p>
      </section>

      <PermissionExplainer />
    </main>
  );
}
