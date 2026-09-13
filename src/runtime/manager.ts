import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { Job, ManagerMessage } from "../types/index.js";

type PendingJob = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class Manager {
  private pendingJobs = new Map<string, PendingJob>();
  private jobQueue: Job[] = [];
  
  private workers: Worker[] = [];
  private idleWorkers = new Set<Worker>();
  private activeWorkerJobs = new Map<Worker, string>();
  
  private maxWorkers: number;

  constructor(maxWorkers: number) {
    this.maxWorkers = maxWorkers;

    for (let i = 0; i < maxWorkers; i++) {
      this.spawnWorker();
    }
  }

  private spawnWorker() {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      execArgv: ['--import', 'tsx']
    });
    
    this.workers.push(worker);
    this.idleWorkers.add(worker);

    worker.on('message', (message: ManagerMessage) => {
      this.handleMessage(worker, message);
    });

    worker.on('error', (err) => {
      this.handleWorkerCrash(worker, err.message);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerCrash(worker, `Worker exited with code ${code}`);
      }
    });
  }

  private handleWorkerCrash(worker: Worker, reason: string) {
    // Reject the promise if the worker was executing a job
    const jobId = this.activeWorkerJobs.get(worker);
    
    if (jobId && this.pendingJobs.has(jobId)) {
      const { reject } = this.pendingJobs.get(jobId)!;
      reject(new Error(`Worker crashed: ${reason}`));
      this.pendingJobs.delete(jobId);
    }

    // Purge the dead worker from all state tracking
    this.activeWorkerJobs.delete(worker);
    this.idleWorkers.delete(worker);
    this.workers = this.workers.filter(w => w !== worker);

    // Self-heal the pool and check for waiting jobs
    this.spawnWorker();
    this.dispatch();
  }

  enqueue(code: string): Promise<unknown> {
    const jobId = randomUUID();

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingJobs.set(jobId, { resolve, reject });
    });

    this.jobQueue.push({ jobId, code });
    this.dispatch();

    return promise;
  }

  private dispatch() {
    while (this.jobQueue.length > 0 && this.idleWorkers.size > 0) {
      const job = this.jobQueue.shift()!;
      
      const worker = this.idleWorkers.values().next().value!;
      
      this.idleWorkers.delete(worker);
      this.activeWorkerJobs.set(worker, job.jobId);
      
      worker.postMessage({ type: "EXECUTE", payload: job });
    }
  }

  private handleMessage(worker: Worker, message: ManagerMessage) {
    this.activeWorkerJobs.delete(worker);

    if (this.pendingJobs.has(message.jobId)) {
      const { resolve, reject } = this.pendingJobs.get(message.jobId)!;
      
      if (message.type === "SUCCESS") {
        resolve(message.result);
      } else {
        reject(new Error(message.error));
      }

      this.pendingJobs.delete(message.jobId);
    }

    this.idleWorkers.add(worker);
    this.dispatch();
  }
}
