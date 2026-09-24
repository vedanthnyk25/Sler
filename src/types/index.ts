//HTTP handler->Manager
export interface Job {
  jobId: string;
  tenantId: string;
  code: string;
  enqueuedAt: number;
  dispatchedAt?: number;
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
      isolateCreationTime: number;
      scriptExecutionTime: number;
    }
  | {
      type: 'ERROR';
      jobId: string;
      error: string;
    };

export interface IsolateExecutionResult {
  result: unknown;
  isolateCreationTime: number;
  scriptExecutionTime: number;
}
