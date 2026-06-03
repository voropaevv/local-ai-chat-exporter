import type { ExportFormat } from "../../core/schema";
import {
  FILENAME_TEMPLATE_TOKENS,
  createFilenamePreview,
  createFilenameTemplate,
  getFilenameTemplateTokenLabel,
  moveFilenameTemplateSegment,
  parseFilenameTemplate,
  removeFilenameTemplateSegment,
  type FilenameTemplateSegment,
  type FilenameTemplateToken
} from "../filename-template";

interface FilenameTemplateBuilderProps {
  readonly format: ExportFormat;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

export function FilenameTemplateBuilder({
  format,
  onChange,
  value
}: FilenameTemplateBuilderProps) {
  const segments = parseFilenameTemplate(value);
  const preview = createFilenamePreview(value, {
    conversationId: "abc123",
    datetime: "2026-06-03T10-20-30Z",
    format,
    platform: "chatgpt",
    title: "DNA Analysis"
  });

  function updateSegments(nextSegments: readonly FilenameTemplateSegment[]) {
    onChange(createFilenameTemplate(nextSegments));
  }

  function addToken(token: FilenameTemplateToken) {
    updateSegments([...segments, { kind: "token", token }]);
  }

  function addText(valueToAdd: string) {
    if (valueToAdd.length === 0) {
      return;
    }

    updateSegments([...segments, { kind: "text", value: valueToAdd }]);
  }

  function moveSegmentToIndex(sourceIndex: number, targetIndex: number) {
    if (sourceIndex === targetIndex || sourceIndex < 0 || sourceIndex >= segments.length) {
      return;
    }

    const nextSegments = [...segments];
    const [segment] = nextSegments.splice(sourceIndex, 1);
    nextSegments.splice(targetIndex, 0, segment);
    updateSegments(nextSegments);
  }

  return (
    <div className="filename-builder">
      <div className="field-row">
        <span>Filename template</span>
        <div className="filename-token-list" aria-label="Filename template segments">
          {segments.map((segment, index) => (
            <FilenameTemplateSegmentChip
              index={index}
              key={`${segment.kind}-${index}-${renderSegmentLabel(segment)}`}
              onMove={(offset) => updateSegments(moveFilenameTemplateSegment(segments, index, offset))}
              onMoveTo={(sourceIndex) => moveSegmentToIndex(sourceIndex, index)}
              onRemove={() => updateSegments(removeFilenameTemplateSegment(segments, index))}
              segment={segment}
            />
          ))}
        </div>
      </div>
      <div className="token-palette" aria-label="Filename token palette">
        {FILENAME_TEMPLATE_TOKENS.map((token) => (
          <button
            className="token-chip"
            key={token.token}
            onClick={() => addToken(token.token)}
            type="button"
          >
            {token.label}
          </button>
        ))}
      </div>
      <label className="field-row">
        <span>Custom text or separator</span>
        <input
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            addText(event.currentTarget.value);
            event.currentTarget.value = "";
          }}
          placeholder="_ - ."
          type="text"
        />
      </label>
      <label className="field-row">
        <span>Stored template string</span>
        <input onInput={(event) => onChange(event.currentTarget.value)} type="text" value={value} />
      </label>
      <p className="status-text">Preview: {preview}</p>
      <p className="muted">
        Tokens: {"{"}date{"}"}, {"{"}time{"}"}, {"{"}datetime{"}"}, {"{"}platform{"}"},{" "}
        {"{"}title{"}"}, {"{"}conversationId{"}"}, {"{"}format{"}"}.
      </p>
    </div>
  );
}

interface FilenameTemplateSegmentChipProps {
  readonly index: number;
  readonly onMove: (offset: number) => void;
  readonly onMoveTo: (sourceIndex: number) => void;
  readonly onRemove: () => void;
  readonly segment: FilenameTemplateSegment;
}

function FilenameTemplateSegmentChip({
  index,
  onMove,
  onMoveTo,
  onRemove,
  segment
}: FilenameTemplateSegmentChipProps) {
  return (
    <span
      className="filename-segment"
      draggable={true}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => event.dataTransfer?.setData("text/plain", String(index))}
      onDrop={(event) => {
        event.preventDefault();
        const sourceIndex = Number(event.dataTransfer?.getData("text/plain"));

        if (Number.isInteger(sourceIndex)) {
          onMoveTo(sourceIndex);
        }
      }}
    >
      <span>{renderSegmentLabel(segment)}</span>
      <button aria-label={`Move segment ${index + 1} left`} onClick={() => onMove(-1)} type="button">
        &lt;
      </button>
      <button aria-label={`Move segment ${index + 1} right`} onClick={() => onMove(1)} type="button">
        &gt;
      </button>
      <button aria-label={`Remove segment ${index + 1}`} onClick={onRemove} type="button">
        x
      </button>
    </span>
  );
}

function renderSegmentLabel(segment: FilenameTemplateSegment): string {
  return segment.kind === "token" ? getFilenameTemplateTokenLabel(segment.token) : segment.value;
}
