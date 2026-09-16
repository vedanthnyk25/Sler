import client from "prom-client";

export class Metrics {
  private readonly register: client.Registry;

  private readonly jobWaitTime: client.Histogram<string>;
  private readonly jobExecutionTime: client.Histogram<string>;
  private readonly jobTotalTime: client.Histogram<string>;

  private readonly jobsTotal: client.Counter<string>;

  constructor() {
    this.register = new client.Registry();

    this.jobWaitTime = new client.Histogram({
      name: "sler_job_wait_time_ms",
      help: "Time a job spends waiting in the scheduler queue",
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.register],
    });

    this.jobExecutionTime = new client.Histogram({
      name: "sler_job_execution_time_ms",
      help: "Time spent executing a job in a worker",
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.register],
    });

    this.jobTotalTime = new client.Histogram({
      name: "sler_job_total_time_ms",
      help: "Total time from job enqueue to completion",
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.register],
    });

    this.jobsTotal = new client.Counter({
      name: "sler_jobs_total",
      help: "Total number of completed jobs",
      labelNames: ["status"],
      registers: [this.register],
    });
  }

  recordQueueWait(durationMs: number): void {
    this.jobWaitTime.observe(durationMs);
  }

  recordExecutionTime(durationMs: number): void {
    this.jobExecutionTime.observe(durationMs);
  }

  recordTotalTime(durationMs: number): void {
    this.jobTotalTime.observe(durationMs);
  }

  recordSuccess(): void {
    this.jobsTotal.inc({ status: "success" });
  }

  recordFailure(): void {
    this.jobsTotal.inc({ status: "failure" });
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}
