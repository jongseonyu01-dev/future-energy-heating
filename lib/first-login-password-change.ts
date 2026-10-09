export interface ForcedPasswordChangeCandidate {
  userId: number;
  loginId: string;
  appRole: string;
  token: string;
  currentPassword: string;
  name?: string | null;
  technicianId?: number | null;
  branchId?: number | null;
  branchName?: string | null;
  phoneNumber?: string | null;
}

export interface CompletedPasswordChange {
  userId: number;
  loginId: string;
  appRole: string;
  token: string;
  name?: string | null;
  technicianId?: number | null;
  branchId?: number | null;
  branchName?: string | null;
  phoneNumber?: string | null;
  mustChangePassword: false;
}

export interface PendingForcedPasswordChange extends ForcedPasswordChangeCandidate {
  generation: number;
}

/**
 * Keeps the one-time, first-login credential in component memory only. A newer
 * login attempt or an explicit cancellation invalidates every prior completion,
 * so an old response cannot establish a different account's session.
 */
export class FirstLoginPasswordChange {
  private generation = 0;

  begin(candidate: ForcedPasswordChangeCandidate): PendingForcedPasswordChange {
    this.generation += 1;
    return { ...candidate, generation: this.generation };
  }

  cancel(): void {
    this.generation += 1;
  }

  isCurrent(pending: PendingForcedPasswordChange | null | undefined): pending is PendingForcedPasswordChange {
    return pending !== null && pending !== undefined && pending.generation === this.generation;
  }

  complete(
    pending: PendingForcedPasswordChange,
    response: { success: boolean; token?: string | null; technicianId?: number | null },
  ): CompletedPasswordChange | null {
    if (!this.isCurrent(pending) || !response.success || !response.token) return null;

    // Invalidate duplicate taps and late responses before the caller persists
    // the server-issued replacement token.
    this.generation += 1;
    const { currentPassword: _currentPassword, generation: _generation, ...identity } = pending;
    return {
      ...identity,
      token: response.token,
      technicianId: response.technicianId ?? identity.technicianId ?? null,
      mustChangePassword: false,
    };
  }
}
