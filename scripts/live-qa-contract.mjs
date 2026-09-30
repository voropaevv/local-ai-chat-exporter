import { createHash } from "node:crypto";

export const LIVE_QA_CONTRACT = Object.freeze({
  schemaVersion: 2,
  browsers: ["chrome", "brave", "edge", "vivaldi"],
  providers: ["chatgpt", "claude", "gemini", "perplexity", "notebooklm"],
  stages: [
    "installation",
    "cold-short",
    "cold-long",
    "background-long",
    "selected-batch",
    "lifecycle",
    "formats-visual"
  ],
  automatedExportStages: ["cold-short", "cold-long", "background-long"],
  normalization: "NFC; CRLF/CR to LF; trim exterior whitespace; preserve internal whitespace",
  referenceAuthority: "Independent reviewed source, never the candidate export itself",
  referencePayload: "Retain canonical expected messages and reconstruct the reference fingerprint",
  longConversation: "At least 50 messages or 50000 normalized text characters"
});

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export const contractSha256 = sha256(JSON.stringify(LIVE_QA_CONTRACT));

export function verifyInstallation(installation, expectedResources, version) {
  if (
    installation?.version !== version ||
    !Array.isArray(installation.resources) ||
    installation.resources.length !== expectedResources.length ||
    !expectedResources.length
  )
    return false;
  const actual = new Map(installation.resources.map((resource) => [resource.name, resource]));
  return (
    actual.size === expectedResources.length &&
    expectedResources.every((expected) => {
      const resource = actual.get(expected.name);
      return resource?.sha256 === expected.sha256 && resource?.bytes === expected.bytes;
    })
  );
}

export function verifyVisibility(stage, visibility) {
  if (!LIVE_QA_CONTRACT.automatedExportStages.includes(stage)) return false;
  const expected = stage === "background-long" ? "hidden" : "visible";
  return (
    Array.isArray(visibility?.states) &&
    visibility.states.length >= 2 &&
    visibility.states.every((state) => state === expected)
  );
}

export function conversationFingerprint(conversation) {
  if (!conversation || !Array.isArray(conversation.messages) || !conversation.messages.length) {
    throw new Error("Export contains no messages");
  }
  if (conversation.messageCount !== conversation.messages.length) {
    throw new Error("Declared message count differs from saved messages");
  }
  const messages = conversation.messages.map((message, index) => {
    if (
      !message ||
      typeof message.text !== "string" ||
      typeof message.role !== "string" ||
      message.index !== index
    ) {
      throw new Error("Invalid message schema or non-sequential index");
    }
    return {
      role: message.role,
      text: message.text.normalize("NFC").replace(/\r\n?/g, "\n").trim()
    };
  });
  return {
    messageCount: messages.length,
    textCharacterCount: messages.reduce((sum, message) => sum + message.text.length, 0),
    orderedTextSha256: sha256(JSON.stringify(messages))
  };
}

export function compareExport(conversation, reference, download, stage) {
  const issues = [];
  const fingerprint = conversationFingerprint(conversation);
  let expected;
  try {
    expected = conversationFingerprint({
      messageCount: reference?.messageCount,
      messages: reference?.messages?.map((message, index) => ({ ...message, index }))
    });
  } catch {
    issues.push("Retained independent reference messages are missing or invalid");
  }
  if (
    !reference ||
    reference.schemaVersion !== 1 ||
    !Number.isFinite(Date.parse(reference.reviewedAt)) ||
    !reference.sourceDescription ||
    reference.origin === "candidate-export" ||
    !["independent-source", "independent-manual-review"].includes(reference.origin)
  ) {
    issues.push("Independent reviewed reference is missing or invalid");
  }
  if (
    expected &&
    (expected.orderedTextSha256 !== reference.orderedTextSha256 ||
      expected.textCharacterCount !== reference.textCharacterCount)
  ) {
    issues.push("Reference fingerprint differs from its retained source messages");
  }
  if (
    reference?.messageCount !== fingerprint.messageCount ||
    reference?.orderedTextSha256 !== fingerprint.orderedTextSha256 ||
    reference?.textCharacterCount !== fingerprint.textCharacterCount
  ) {
    issues.push("Saved message content/order differs from the independent reference");
  }
  const isLong = fingerprint.messageCount >= 50 || fingerprint.textCharacterCount >= 50000;
  if (
    (stage === "cold-short" && isLong) ||
    (["cold-long", "background-long"].includes(stage) && !isLong)
  ) {
    issues.push("Conversation size does not cover the declared short/long stage");
  }
  if (reference?.platform !== conversation.platform) issues.push("Provider differs from reference");
  if (
    !download ||
    download.state !== "completed" ||
    download.bytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(download.sha256 ?? "")
  ) {
    issues.push("Download completion and saved bytes are not proven");
  }
  if (!["complete", "probably_complete"].includes(conversation.completeness?.status)) {
    issues.push("Exporter reports incomplete or unknown coverage");
  }
  return { fingerprint, issues, passed: issues.length === 0 };
}

export function validateMatrix(receipts, build) {
  const issues = [];
  const seen = new Set();
  const accepted = new Set();
  for (const receipt of receipts) {
    const key = `${receipt.browser}/${receipt.provider}/${receipt.stage}`;
    if (receipt.schemaVersion !== 1) {
      issues.push(`Invalid receipt schema: ${key}`);
      continue;
    }
    if (
      !LIVE_QA_CONTRACT.browsers.includes(receipt.browser) ||
      !LIVE_QA_CONTRACT.stages.includes(receipt.stage) ||
      !(
        LIVE_QA_CONTRACT.providers.includes(receipt.provider) ||
        (receipt.provider === "all" && receipt.stage === "installation")
      )
    ) {
      issues.push(`Unknown matrix cell: ${key}`);
      continue;
    }
    if (seen.has(key)) issues.push(`Duplicate evidence: ${key}`);
    seen.add(key);
    if (
      receipt.contractSha256 !== contractSha256 ||
      receipt.build?.distSha256 !== build.distSha256 ||
      receipt.build?.sourceSha256 !== build.sourceSha256 ||
      receipt.build?.version !== build.version
    ) {
      issues.push(`Stale or incompatible evidence: ${key}`);
      continue;
    }
    if (
      receipt.verified !== true ||
      receipt.error ||
      receipt.cleanup !== "closed_verified" ||
      (receipt.wakeGuard && receipt.wakeGuard.cleanup !== "closed_verified")
    ) {
      issues.push(`Evidence or cleanup not verified: ${key}`);
      continue;
    }
    const keys =
      receipt.provider === "all"
        ? LIVE_QA_CONTRACT.providers.map(
            (provider) => `${receipt.browser}/${provider}/${receipt.stage}`
          )
        : [key];
    for (const acceptedKey of keys) {
      if (accepted.has(acceptedKey)) issues.push(`Overlapping evidence: ${acceptedKey}`);
      accepted.add(acceptedKey);
    }
  }
  const missing = [];
  for (const browser of LIVE_QA_CONTRACT.browsers) {
    for (const provider of LIVE_QA_CONTRACT.providers) {
      for (const stage of LIVE_QA_CONTRACT.stages) {
        const key = `${browser}/${provider}/${stage}`;
        if (!accepted.has(key)) missing.push(key);
      }
    }
  }
  return {
    ready: issues.length === 0 && missing.length === 0,
    issues,
    missing,
    required: 140,
    verified: accepted.size
  };
}
