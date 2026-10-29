import { browser } from "wxt/browser";
import { isOrganizationMethod } from "./methods";
import {
  TAB_GROUP_COLORS,
  type AppliedGroup,
  type ApplyResult,
  type JobState,
  type Proposal,
  type UndoRecord,
} from "./types";

const JOB_KEY = "ato.job.v1";
const UNDO_KEY = "ato.undo.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "number")
  );
}

function isProposal(value: unknown): value is Proposal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.windowId === "number" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    isOrganizationMethod(value.method) &&
    (value.source === "ai" || value.source === "local") &&
    Array.isArray(value.groups) &&
    Array.isArray(value.ungrouped)
  );
}

function isAppliedGroup(value: unknown): value is AppliedGroup {
  return (
    isRecord(value) &&
    typeof value.groupId === "number" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    (TAB_GROUP_COLORS as readonly string[]).includes(value.color) &&
    isNumberArray(value.tabIds)
  );
}

function isApplyResult(value: unknown): value is ApplyResult {
  return (
    isRecord(value) &&
    typeof value.appliedAt === "number" &&
    typeof value.windowId === "number" &&
    Array.isArray(value.groups) &&
    value.groups.every(isAppliedGroup) &&
    typeof value.groupedTabCount === "number" &&
    typeof value.skippedTabCount === "number" &&
    typeof value.skippedGroupCount === "number"
  );
}

function isJobState(value: unknown): value is JobState {
  if (!isRecord(value) || typeof value.status !== "string") return false;

  switch (value.status) {
    case "idle":
      return true;
    case "organizing":
    case "applying":
      return typeof value.startedAt === "number";
    case "applied":
      return isProposal(value.proposal) && isApplyResult(value.result);
    case "error":
      return (
        (value.phase === "organize" || value.phase === "apply") &&
        typeof value.message === "string"
      );
    default:
      return false;
  }
}

function isUndoRecord(value: unknown): value is UndoRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.windowId === "number" &&
    typeof value.tabCount === "number" &&
    Array.isArray(value.groups) &&
    value.groups.every(isAppliedGroup)
  );
}

export async function loadJob(): Promise<JobState> {
  try {
    const stored = await browser.storage.session.get(JOB_KEY);
    const job = stored[JOB_KEY];
    if (isJobState(job)) return job;
  } catch {
    // Fall through to idle.
  }
  return { status: "idle" };
}

export async function saveJob(job: JobState): Promise<void> {
  await browser.storage.session.set({ [JOB_KEY]: job });
}

export async function loadUndo(): Promise<UndoRecord | null> {
  try {
    const stored = await browser.storage.session.get(UNDO_KEY);
    const undo = stored[UNDO_KEY];
    if (isUndoRecord(undo)) return undo;
  } catch {
    // Fall through to null.
  }
  return null;
}

export async function saveUndo(undo: UndoRecord): Promise<void> {
  await browser.storage.session.set({ [UNDO_KEY]: undo });
}

export async function clearUndo(): Promise<void> {
  await browser.storage.session.remove(UNDO_KEY);
}
