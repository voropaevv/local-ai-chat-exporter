import { useEffect, useState } from "preact/hooks";

import {
  DEFAULT_REDACTION_SETTINGS,
  normalizeRedactionSettings,
  type RedactionPreset,
  type RedactionSettings
} from "../core/redaction";
import { FilenameTemplateBuilder } from "./components/FilenameTemplateBuilder";
import { BrandIcon } from "./components/BrandIcon";
import { PermissionExplainer } from "./components/PermissionExplainer";
import { PRIVACY_SUMMARY, PrivacyPanel } from "./components/PrivacyPanel";
import {
  DEFAULT_EXPORT_SETTINGS,
  normalizeExportSettings,
  readStoredExportSettings,
  writeStoredExportSettings,
  type ExportSettings
} from "./export-settings-storage";
import { readStoredRedactionSettings, writeStoredRedactionSettings } from "./redaction-storage";
import { SUPPORT_LINKS, SUPPORT_TAGLINE } from "./support-links";

export function OptionsApp() {
  const [copyStatus, setCopyStatus] = useState("Ready.");
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [filenameSaveStatus, setFilenameSaveStatus] = useState(
    "Stored locally in browser storage."
  );
  const [redaction, setRedaction] = useState<RedactionSettings>(DEFAULT_REDACTION_SETTINGS);
  const [redactionSaveStatus, setRedactionSaveStatus] = useState(
    "Stored locally in browser storage."
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([readStoredRedactionSettings(), readStoredExportSettings()])
      .then(([redactionSettings, storedExportSettings]) => {
        if (!cancelled) {
          setRedaction(redactionSettings);
          setExportSettings(storedExportSettings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFilenameSaveStatus("Storage is unavailable in this context.");
          setRedactionSaveStatus("Storage is unavailable in this context.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateRedaction(next: RedactionSettings) {
    const normalized = normalizeRedactionSettings(next);
    setRedaction(normalized);
    setRedactionSaveStatus("Saving locally...");

    writeStoredRedactionSettings(normalized)
      .then(() => setRedactionSaveStatus("Saved locally."))
      .catch(() => setRedactionSaveStatus("Could not save settings in this context."));
  }

  function updateFilenameTemplate(filenameTemplate: string) {
    const normalized = normalizeExportSettings({ filenameTemplate });
    setExportSettings(normalized);
    setFilenameSaveStatus("Saving locally...");

    writeStoredExportSettings(normalized)
      .then(() => setFilenameSaveStatus("Saved locally."))
      .catch(() => setFilenameSaveStatus("Could not save settings in this context."));
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
          <h1>AI Chat Export</h1>
          <p className="muted">Privacy controls and permission details.</p>
        </div>
      </header>

      <PrivacyPanel copyStatus={copyStatus} onCopyPrivacySummary={handleCopyPrivacySummary} />

      <section className="panel" aria-labelledby="filename-settings-title" id="filename-settings">
        <h2 id="filename-settings-title">Filename settings</h2>
        <FilenameTemplateBuilder
          format="md"
          onChange={updateFilenameTemplate}
          value={exportSettings.filenameTemplate}
        />
        <p className="status-text" role="status">
          {filenameSaveStatus}
        </p>
      </section>

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
        <div className="settings-examples" aria-label="Redaction preset examples">
          <p className="muted">Examples</p>
          <ul className="compact-list">
            <li>Off: keeps admin@example.com and sk-proj-example unchanged.</li>
            <li>Basic: redacts admin@example.com and +1 415 555 2671.</li>
            <li>Strict: redacts Basic matches plus token-like secrets.</li>
            <li>Custom: applies Basic redaction plus the regex list above.</li>
          </ul>
        </div>
        <p className="status-text" role="status">
          {redactionSaveStatus}
        </p>
      </section>

      <PermissionExplainer />

      <section className="panel" aria-labelledby="support-title" id="support">
        <h2 id="support-title">Support AI Chat Export</h2>
        <p className="muted">{SUPPORT_TAGLINE}</p>
        <div className="support-links" aria-label="Donation and support links">
          {SUPPORT_LINKS.map((link) => (
            <a href={link.href} key={link.label} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ))}
        </div>
        <h3>Business model</h3>
        <ul className="compact-list">
          <li>Core exports stay free and open-source.</li>
          <li>Donations support maintenance and provider compatibility work.</li>
          <li>Paid support and custom enterprise builds are optional services.</li>
          <li>Any future cloud companion must remain optional, not core export infrastructure.</li>
        </ul>
      </section>
    </main>
  );
}
