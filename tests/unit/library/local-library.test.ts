import { describe, expect, test } from "vitest";

import type { ConversationExport } from "../../../src/core/schema";
import {
  createLocalLibraryBackupFile,
  createLocalLibraryRecord,
  filterLocalLibraryRecords,
  renderLocalLibraryRecord
} from "../../../src/library/local-library";

const conversation: ConversationExport = {
  completeness: {
    duplicateCount: 0,
    messageCount: 2,
    platformWarnings: [],
    reachedBottom: true,
    reachedTop: true,
    scrollSteps: 2,
    status: "complete",
    warnings: []
  },
  conversationId: "library-test",
  exportedAt: "2026-06-09T10:20:30.000Z",
  messageCount: 2,
  messages: [
    {
      authorLabel: "User",
      codeBlocks: [],
      id: "u1",
      images: [],
      index: 0,
      metadata: {},
      role: "user",
      text: "Find DNA notes"
    },
    {
      authorLabel: "ChatGPT",
      codeBlocks: [],
      id: "a1",
      images: [],
      index: 1,
      markdown: "DNA archive answer",
      metadata: {},
      role: "assistant",
      text: "DNA archive answer"
    }
  ],
  platform: "chatgpt",
  platformLabel: "ChatGPT",
  schemaVersion: "1.0",
  sourceUrl: "https://chatgpt.com/c/library-test",
  title: "DNA Archive"
};

describe("local library records", () => {
  test("creates explicit opt-in records with metadata, hashes, and stored conversation content", () => {
    const record = createLocalLibraryRecord(conversation, {
      projectLabel: "Research",
      savedAt: "2026-06-09T11:00:00.000Z",
      tags: ["dna", "archive"]
    });

    expect(record).toMatchObject({
      completenessStatus: "complete",
      exportDate: "2026-06-09T10:20:30.000Z",
      messageCount: 2,
      projectLabel: "Research",
      sourcePlatform: "ChatGPT",
      tags: ["dna", "archive"],
      title: "DNA Archive"
    });
    expect(record.id).toMatch(/^library-h[0-9a-z]+$/u);
    expect(record.hashes.contentHash).toMatch(/^h[0-9a-z]+$/u);
    expect(record.hashes.messageHashes).toHaveLength(2);
    expect(record.conversation.messages[1].text).toBe("DNA archive answer");
  });

  test("filters records by search, tags, project label, and source platform", () => {
    const dnaRecord = createLocalLibraryRecord(conversation, {
      projectLabel: "Research",
      savedAt: "2026-06-09T11:00:00.000Z",
      tags: ["dna", "archive"]
    });
    const otherRecord = createLocalLibraryRecord(
      { ...conversation, platform: "claude", platformLabel: "Claude", title: "Travel Plan" },
      {
        projectLabel: "Personal",
        savedAt: "2026-06-09T12:00:00.000Z",
        tags: ["travel"]
      }
    );

    expect(
      filterLocalLibraryRecords([dnaRecord, otherRecord], {
        projectLabel: "Research",
        query: "archive",
        sourcePlatform: "ChatGPT",
        tags: ["dna"]
      }).map((record) => record.id)
    ).toEqual([dnaRecord.id]);
  });

  test("creates backup JSON and re-exports archived records through existing renderers", () => {
    const record = createLocalLibraryRecord(conversation, {
      projectLabel: "Research",
      savedAt: "2026-06-09T11:00:00.000Z",
      tags: ["dna"]
    });
    const backup = createLocalLibraryBackupFile([record], "2026-06-09T12:30:00.000Z");
    const markdown = renderLocalLibraryRecord(record, "md");

    expect(backup.filename).toBe("ai-chat-export-local-library-backup-2026-06-09.json");
    expect(backup.bytes).toContain('"schemaVersion": "1.0"');
    expect(backup.bytes).toContain('"records"');
    expect(markdown.filename).toBe("DNA-Archive.md");
    expect(markdown.bytes).toContain("DNA archive answer");
  });
});
