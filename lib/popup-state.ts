import { readTabSnapshot } from "./browser/tabs";
import { loadSettings } from "./settings";
import { loadJob, loadUndo, saveJob } from "./state";
import type { JobState, PopupState } from "./types";

const STALE_OPERATION_MS = 120_000;

export async function getPopupState(windowId: number): Promise<PopupState> {
  const [snapshot, settings, storedJob, undo] = await Promise.all([
    readTabSnapshot(windowId),
    loadSettings(),
    loadJob(),
    loadUndo(),
  ]);

  let job: JobState = storedJob;
  if (
    (job.status === "organizing" || job.status === "applying") &&
    Date.now() - job.startedAt > STALE_OPERATION_MS
  ) {
    job =
      job.status === "organizing"
        ? {
            status: "error",
            phase: "organize",
            message:
              "The AI request was interrupted before it finished. Please try again.",
          }
        : {
            status: "error",
            phase: "apply",
            message:
              "The grouping operation was interrupted. Some tabs may already be grouped. Use Undo if it is available, or reload the window.",
          };
    await saveJob(job).catch(() => undefined);
  }

  return { snapshot, settings, job, undo };
}
