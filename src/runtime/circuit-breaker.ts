type TenantCircuitState = {
  consecutiveFailures: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  openedAt?: number | undefined;
  halfOpenTrialInProgress: boolean;
};

export class CircuitBreaker {
  private circuitStates: Map<string, TenantCircuitState> = new Map();

  private readonly FAILURE_THRESHOLD = 5;
  private readonly COOLDOWN_MS = 60_000;

  private getState(tenantId: string): TenantCircuitState {
    if (!this.circuitStates.has(tenantId)) {
      this.circuitStates.set(tenantId, {
        consecutiveFailures: 0,
        state: 'CLOSED',
        halfOpenTrialInProgress: false,
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
      state.halfOpenTrialInProgress = false;
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
    state.halfOpenTrialInProgress = false;
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
        state.halfOpenTrialInProgress = true;

        return true;
      }

      return false;
    }

    // HALF_OPEN — only allow one trial request
    if (state.state === 'HALF_OPEN') {
      return false;
    }

    return false;
  }
}
