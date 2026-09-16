import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Metrics } from '../metrics/index.js';

import type { Job, ManagerMessage } from '../types/index.js';
import { CircuitOpenError, QueueFullError } from './errors.js';
import { Scheduler } from './scheduler.js';
import { TenantManager } from './tenant-manager.js';

type PendingJob = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class Manager {
  private readonly pendingJobs = new Map<string, PendingJob>();

  private workers: Worker[] = [];
  private readonly idleWorkers = new Set<Worker>();

  private readonly activeWorkerJobs = new Map<Worker, Job>();

  private readonly scheduler = new Scheduler();
  private readonly tenantManager = new TenantManager();
  private readonly metrics: Metrics;

  constructor(private readonly maxWorkers: number, metrics: Metrics) {
    this.metrics = metrics;
    
    for (let i = 0; i < maxWorkers; i++) {
      this.spawnWorker();
    }
  }

  private spawnWorker(): void {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      execArgv: ['--import', 'tsx'],
    });

    this.workers.push(worker);
    this.idleWorkers.add(worker);

    worker.on('message', (message: ManagerMessage) => {
      this.handleMessage(worker, message);
    });

    worker.on('error', (err: Error) => {
      this.handleWorkerCrash(worker, err.message);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerCrash(worker, `Worker exited with code ${code}`);
      }
    });
  }

  enqueue(code: string, tenantId: string): Promise<unknown> {
    // Circuit breaker is checked first because it is admission control.
    if (!this.tenantManager.circuitAllows(tenantId)) {
      return Promise.reject(new CircuitOpenError());
    }

    const queueSize = this.scheduler.queueSize(tenantId);

    if (!this.tenantManager.queueAllows(queueSize)) {
      return Promise.reject(new QueueFullError());
    }

    const jobId = randomUUID();

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingJobs.set(jobId, {
        resolve,
        reject,
      });
    });

    const job: Job = {
      jobId,
      tenantId,
      code,
      enqueuedAt: performance.now(),
    };

    this.scheduler.enqueue(job);

    this.dispatch();

    return promise;
  }

  private dispatch(): void {
    while (this.scheduler.areJobsAvailable() && this.idleWorkers.size > 0) {
      /*
        Scheduler performs round-robin selection.
      
        TenantManager decides whether the selected tenant is currently allowed to consume another worker slot.
      
        An ineligible tenant is skipped without losing its job.
       */
      const job = this.scheduler.next((tenantId: string) =>
        this.tenantManager.canRun(tenantId)
      );

      if (!job) {
        break;
      }

      const now = performance.now();

      job.dispatchedAt = now;
      this.metrics.recordQueueWait(now - job.enqueuedAt);

      const worker = this.idleWorkers.values().next().value;

      if (!worker) {
        break;
      }

      this.idleWorkers.delete(worker);
      this.activeWorkerJobs.set(worker, job);

      this.tenantManager.jobStarted(job.tenantId);

      worker.postMessage({
        type: 'EXECUTE',
        payload: job,
      });
    }
  }

  private handleMessage(worker: Worker, message: ManagerMessage): void {
    const job = this.activeWorkerJobs.get(worker);

    this.activeWorkerJobs.delete(worker);

    if (job) {
      this.tenantManager.jobFinished(job.tenantId);

      const pending = this.pendingJobs.get(message.jobId);

      if (pending) {
        if (message.type === 'SUCCESS') {
          this.tenantManager.recordSuccess(job.tenantId);
          this.metrics.recordSuccess();
          pending.resolve(message.result);
        } else {
          this.tenantManager.recordFailure(job.tenantId);
          this.metrics.recordFailure();
          pending.reject(new Error(message.error));
        }

        const completedAt = performance.now();
        this.metrics.recordExecutionTime(completedAt - job.dispatchedAt!);

        this.metrics.recordTotalTime(completedAt - job.enqueuedAt);

        this.pendingJobs.delete(message.jobId);
      }
    }

    this.idleWorkers.add(worker);

    this.dispatch();
  }

  private handleWorkerCrash(worker: Worker, reason: string): void {
    const job = this.activeWorkerJobs.get(worker);

    if (job) {
      this.tenantManager.jobFinished(job.tenantId);
      this.tenantManager.recordFailure(job.tenantId);

      const pending = this.pendingJobs.get(job.jobId);

      if (pending) {
        pending.reject(new Error(`Worker crashed: ${reason}`));

        this.pendingJobs.delete(job.jobId);
      }

      this.activeWorkerJobs.delete(worker);
    }

    this.idleWorkers.delete(worker);

    this.workers = this.workers.filter((w) => w !== worker);

    this.spawnWorker();

    this.dispatch();
  }
}
