import type { BatchCandidateTab } from "./batch";

export const CHATGPT_HISTORY_LIST_MESSAGE = "jelluvi/list-chatgpt-history";
export const CHATGPT_HISTORY_ACQUIRE_MESSAGE = "jelluvi/acquire-history-chat";
export const CHATGPT_HISTORY_RELEASE_MESSAGE = "jelluvi/release-history-chat";

export interface ChatGptHistoryListRequest {
  readonly type: typeof CHATGPT_HISTORY_LIST_MESSAGE;
  readonly sourceTabId?: number;
  readonly sourceUrl?: string;
  readonly offset?: number;
}

export interface ChatGptHistoryListSuccess {
  readonly tabs: readonly BatchCandidateTab[];
  readonly sourceTabId: number;
  readonly sourceUrl: string;
  readonly nextOffset?: number;
  readonly total?: number;
}

export interface ChatGptHistoryAcquireRequest {
  readonly type: typeof CHATGPT_HISTORY_ACQUIRE_MESSAGE;
  readonly operationId: string;
  readonly ownerTabId: number;
  readonly target: NonNullable<BatchCandidateTab["history"]>;
}

export interface ChatGptHistoryReleaseRequest {
  readonly type: typeof CHATGPT_HISTORY_RELEASE_MESSAGE;
  readonly operationId: string;
  readonly ownerTabId: number;
}

export type ChatGptHistoryRequest =
  | ChatGptHistoryListRequest
  | ChatGptHistoryAcquireRequest
  | ChatGptHistoryReleaseRequest;

export interface ChatGptHistoryAcquireSuccess {
  readonly tab: BatchCandidateTab;
}
