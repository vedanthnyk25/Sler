import { CircuitBreaker } from './circuit-breaker.js';

export class TenantManager {
  private readonly circuitBreaker = new CircuitBreaker();

  private readonly tenantConcurrency = new Map<string, number>();

  private readonly MAX_QUEUE_DEPTH = 100;
  private readonly MAX_CONCURRENT_PER_TENANT = 2;

  circuitAllows(tenantId: string): boolean {
    return this.circuitBreaker.isAllowed(tenantId);
  }

  queueAllows(queueSize: number): boolean {
    return queueSize < this.MAX_QUEUE_DEPTH;
  }

  canRun(tenantId: string): boolean {
    const current = this.tenantConcurrency.get(tenantId) ?? 0;

    return current < this.MAX_CONCURRENT_PER_TENANT;
  }

  jobStarted(tenantId: string): void {
    const current = this.tenantConcurrency.get(tenantId) ?? 0;

    this.tenantConcurrency.set(tenantId, current + 1);
  }

  jobFinished(tenantId: string): void {
    const current = this.tenantConcurrency.get(tenantId) ?? 0;

    if (current <= 1) {
      this.tenantConcurrency.delete(tenantId);
    } else {
      this.tenantConcurrency.set(tenantId, current - 1);
    }
  }

  recordSuccess(tenantId: string): void {
    this.circuitBreaker.recordSuccess(tenantId);
  }

  recordFailure(tenantId: string): void {
    this.circuitBreaker.recordFailure(tenantId);
  }
}
