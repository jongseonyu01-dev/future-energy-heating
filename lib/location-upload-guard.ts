/**
 * Re-checks the active sharing generation around every awaited credential,
 * request, and response boundary.  It is deliberately dependency-injected so
 * lifecycle races can be tested without a native runtime.
 */
export type GuardedUploadResult<T> =
  | { kind: "STALE" }
  | { kind: "MISSING_CREDENTIAL" }
  | { kind: "RESPONSE"; response: T };

export async function runGuardedLocationUpload<TCredential, TResponse>(params: {
  isCurrent: () => Promise<boolean>;
  getCredential: () => Promise<TCredential | null>;
  request: (credential: TCredential) => Promise<TResponse>;
}): Promise<GuardedUploadResult<TResponse>> {
  if (!(await params.isCurrent())) return { kind: "STALE" };
  const credential = await params.getCredential();
  if (!(await params.isCurrent())) return { kind: "STALE" };
  if (!credential) return { kind: "MISSING_CREDENTIAL" };
  const response = await params.request(credential);
  if (!(await params.isCurrent())) return { kind: "STALE" };
  return { kind: "RESPONSE", response };
}
