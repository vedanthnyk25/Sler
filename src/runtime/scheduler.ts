import type { Job } from '../types/index.js';

export class Scheduler {
  private jobQueue: Map<string, Job[]> = new Map();

  private activeTenants: string[] = [];
  private currentTenant = 0;

  enqueue(job: Job) {
    const { tenantId } = job;

    if (!this.jobQueue.has(tenantId)) {
      this.jobQueue.set(tenantId, []);
      this.activeTenants.push(tenantId);
    }

    this.jobQueue.get(tenantId)!.push(job);
  }

  next(isEligible: (tenantId: string) => boolean): Job | undefined {
    if (this.activeTenants.length === 0) {
      return undefined;
    }

    const tenantCount = this.activeTenants.length;

    for (let i = 0; i < tenantCount; i++) {
      const index = (this.currentTenant + i) % this.activeTenants.length;

      const tenantId = this.activeTenants[index]!;

      if (!isEligible(tenantId)) {
        continue;
      }

      const queue = this.jobQueue.get(tenantId)!;
      const job = queue.shift()!;

      if (queue.length === 0) {
        this.jobQueue.delete(tenantId);
        this.activeTenants.splice(index, 1);

        if (this.activeTenants.length > 0) {
          this.currentTenant %= this.activeTenants.length;
        } else {
          this.currentTenant = 0;
        }
      } else {
        this.currentTenant = (index + 1) % this.activeTenants.length;
      }

      return job;
    }

    return undefined;
  }

  areJobsAvailable(): boolean {
    return this.activeTenants.length > 0;
  }

  queueSize(tenantId: string): number {
    return this.jobQueue.get(tenantId)?.length ?? 0;
  }
}
