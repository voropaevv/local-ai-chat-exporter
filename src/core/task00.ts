export interface Task00PopupState {
  readonly extensionName: string;
  readonly platformStatus: string;
  readonly scanButtonLabel: string;
  readonly canScanConversation: boolean;
  readonly privacyNote: string;
}

export interface Task00OptionsPlaceholder {
  readonly label: string;
  readonly description: string;
}

export function getTask00PopupState(): Task00PopupState {
  return {
    extensionName: "AI Chat Export",
    platformStatus: "Ready to export the current supported chat tab.",
    scanButtonLabel: "Export Markdown",
    canScanConversation: true,
    privacyNote: "100% local processing. No telemetry, trackers, remote logging, or remote servers."
  };
}

export function getTask00OptionsPlaceholders(): readonly Task00OptionsPlaceholder[] {
  return [
    {
      label: "Default export format",
      description: "Markdown will be the default once export rendering is implemented."
    },
    {
      label: "Filename template",
      description: "Local filename preferences will be stored in browser storage."
    },
    {
      label: "Optional permissions",
      description: "Downloads, tabs, and extra AI chat hosts will require explicit user approval."
    }
  ];
}
