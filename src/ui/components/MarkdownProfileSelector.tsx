import { MARKDOWN_PROFILES, type MarkdownProfile } from "../../renderers";

interface MarkdownProfileSelectorProps {
  readonly onChange: (value: MarkdownProfile) => void;
  readonly value: MarkdownProfile;
}

const PROFILE_LABELS: Readonly<Record<MarkdownProfile, string>> = {
  default: "Default",
  obsidian: "Obsidian",
  github: "GitHub",
  gitbook: "GitBook",
  "research-log": "Research Log"
};

export function MarkdownProfileSelector({ onChange, value }: MarkdownProfileSelectorProps) {
  return (
    <label className="field-row">
      <span>Markdown profile</span>
      <select
        onChange={(event) => onChange(event.currentTarget.value as MarkdownProfile)}
        value={value}
      >
        {MARKDOWN_PROFILES.map((profile) => (
          <option key={profile} value={profile}>
            {PROFILE_LABELS[profile]}
          </option>
        ))}
      </select>
    </label>
  );
}
