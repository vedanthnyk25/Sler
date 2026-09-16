type TenantCircuitState = {
  consecutiveFailures: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  openedAt?: number | undefined;
  halfOpenTrialStartTime?: number | undefined;
};

export class CircuitBreaker {
  private circuitStates: Map<string, TenantCircuitState> = new Map();

  private readonly FAILURE_THRESHOLD = 5;
  private readonly COOLDOWN_MS = 60_000;
  private readonly HALF_OPEN_TRIAL_MS = 10_000;

  private getState(tenantId: string): TenantCircuitState {
    if (!this.circuitStates.has(tenantId)) {
      this.circuitStates.set(tenantId, {
        consecutiveFailures: 0,
        state: 'CLOSED',
      });
    }

    return this.circuitStates.get(tenantId)!;
  }

  recordFailure(tenantId: string) {
    const state = this.getState(tenantId);

    // A failed HALF_OPEN trial immediately reopens the circuit.
    if (state.state === 'HALF_OPEN') {
      state.state = 'OPEN';
      state.openedAt = Date.now();
      return;
    }

    state.consecutiveFailures++;

    if (state.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      state.state = 'OPEN';
      state.openedAt = Date.now();
    }
  }

  recordSuccess(tenantId: string) {
    const state = this.getState(tenantId);

    state.consecutiveFailures = 0;
    state.state = 'CLOSED';
    state.openedAt = undefined;
  }

  isAllowed(tenantId: string): boolean {
    const state = this.getState(tenantId);

    // Normal operation
    if (state.state === 'CLOSED') {
      return true;
    }

    // Circuit is open — check cooldown
    if (state.state === 'OPEN') {
      const now = Date.now();

      if (
        state.openedAt !== undefined &&
        now - state.openedAt >= this.COOLDOWN_MS
      ) {
        state.state = 'HALF_OPEN';
        state.halfOpenTrialStartTime = now;

        return true;
      }

      return false;
    }

    // HALF_OPEN — only allow one trial request
    if (state.state === 'HALF_OPEN') {
      if (
        Date.now() - (state.halfOpenTrialStartTime ?? 0) >=
        this.HALF_OPEN_TRIAL_MS
      ) {
        state.state = 'OPEN';
        state.openedAt = Date.now();
        state.halfOpenTrialStartTime = undefined;

        return false;
      }
    }

    return false;
  }
}
