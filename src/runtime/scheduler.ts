import type { Job } from "../types/index.js";

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

  next(): Job | undefined {
  if (this.activeTenants.length === 0) {
    return undefined;
  }

  const tenantId = this.activeTenants[this.currentTenant]!;
  const queue = this.jobQueue.get(tenantId)!;
  const job = queue.shift()!;

  if (queue.length === 0) {
    this.jobQueue.delete(tenantId);
    this.activeTenants.splice(this.currentTenant, 1);

    if (this.activeTenants.length > 0) {
      this.currentTenant %= this.activeTenants.length;
    } else {
      this.currentTenant = 0;
    }
  } else {
    this.currentTenant = (this.currentTenant + 1) % this.activeTenants.length;
  }

  return job;
}

  areJobsAvailable(): boolean {
    return this.activeTenants.length > 0;
  }
}
