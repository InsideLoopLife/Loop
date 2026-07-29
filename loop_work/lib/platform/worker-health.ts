export type WorkerRunStatus = "running" | "success" | "warning" | "failed";

export type WorkerRunSummary = {
  workerName: string;
  startedAt: string;
  finishedAt?: string | null;
  status: WorkerRunStatus;
  rowsChecked?: number;
  rowsUpdated?: number;
  errorMessage?: string | null;
};

export function isWorkerStale(lastFinishedAt: string | null | undefined, maxAgeMs: number, now = new Date()) {
  if (!lastFinishedAt) return true;
  const then = new Date(lastFinishedAt).getTime();
  if (!Number.isFinite(then)) return true;
  return now.getTime() - then > maxAgeMs;
}
