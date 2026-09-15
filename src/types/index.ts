//HTTP handler->Manager
export interface Job {
  jobId: string;
  tenantId: string;
  code: string;
  enqueuedAt: number;
}

//Manager->Worker
export type WorkerMessage = {
  type: 'EXECUTE';
  payload: Job;
};

//Worker->Manager
export type ManagerMessage =
  | {
      type: 'SUCCESS';
      jobId: string;
      result: unknown;
    }
  | {
      type: 'ERROR';
      jobId: string;
      error: string;
    };
