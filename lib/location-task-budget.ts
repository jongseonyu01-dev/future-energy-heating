/**
 * Creates a deadline for the JavaScript portion of one native TaskManager
 * callback. Each awaited boundary must recalculate the remaining time; a
 * Promise.race alone would return early while its original I/O kept running.
 */
export function createTaskDeadline(budgetMs: number, now = Date.now()): number {
  return Number.isFinite(budgetMs) && budgetMs > 0 ? now + budgetMs : now;
}

export function remainingTaskBudgetMs(deadlineAt: number, now = Date.now()): number {
  if (!Number.isFinite(deadlineAt)) return 0;
  return Math.max(0, deadlineAt - now);
}
