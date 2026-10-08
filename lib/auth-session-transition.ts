/**
 * Authentication transitions may overlap: a cold-start restore can still be
 * waiting on verification while the user completes a newer login. This helper
 * gives every transition a generation and serializes only storage mutations.
 * Network verification stays outside the storage queue so a slow restore never
 * blocks a fresh interactive login.
 */
export class AuthSessionTransition {
  private generation = 0;
  private storageTail: Promise<void> = Promise.resolve();

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  /**
   * Runs a storage mutation only if its transition remains current before the
   * mutation starts. Mutations are serialized so a delayed A write cannot land
   * after a newer B login has committed its own session.
   */
  async runStorage<T>(
    generation: number,
    operation: () => Promise<T>,
  ): Promise<{ applied: boolean; value?: T }> {
    const previous = this.storageTail;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.storageTail = previous.then(() => gate);

    await previous;
    try {
      if (!this.isCurrent(generation)) return { applied: false };
      const value = await operation();
      return { applied: this.isCurrent(generation), value };
    } finally {
      release();
    }
  }
}
