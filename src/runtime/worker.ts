import { parentPort } from "node:worker_threads";
import type { ManagerMessage, WorkerMessage } from "../types/index.js";
import { executeInIsolate } from "./isolate.js";

parentPort?.on("message", async (msg: WorkerMessage) => {
  if (msg.type !== "EXECUTE") return;

  const { code, jobId } = msg.payload;

  try {
    const result = await executeInIsolate(code);

    const response: ManagerMessage = {
      type: "SUCCESS",
      jobId,
      result,
    };

    parentPort?.postMessage(response);
  } catch (error) {
    const response: ManagerMessage = {
      type: "ERROR",
      jobId,
      error: error instanceof Error ? error.message : String(error),
    };

    parentPort?.postMessage(response);
  }
});
