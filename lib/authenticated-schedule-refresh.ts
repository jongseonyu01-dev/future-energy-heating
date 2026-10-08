/**
 * `listMySchedule` is identity-bound on the server but has no client-side
 * technician id. Every declarative and imperative refresh must wait for the
 * current authentication transition to finish.
 */
export function isAuthenticatedScheduleReady(params: {
  userId: number | null | undefined;
  isAuthLoading: boolean;
}): boolean {
  return Boolean(params.userId) && !params.isAuthLoading;
}

export async function refreshAuthenticatedSchedule<T>(params: {
  ready: boolean;
  refetch: () => Promise<T>;
}): Promise<T | undefined> {
  if (!params.ready) return undefined;
  return params.refetch();
}
