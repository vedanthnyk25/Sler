import ivm from 'isolated-vm';
import type { IsolateExecutionResult } from '../types/index.js';

export const executeInIsolate = (code: string): IsolateExecutionResult => {
  const beforeCreation = performance.now();

  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = isolate.createContextSync();

  const isolateCreationTime = performance.now() - beforeCreation;

  try {
    const script = isolate.compileScriptSync(code);

    try {
      const beforeExecution = performance.now();

      const result = script.runSync(context, {
        timeout: 1000,
      });

      const scriptExecutionTime = performance.now() - beforeExecution;

      return {
        result,
        isolateCreationTime,
        scriptExecutionTime,
      };
    } finally {
      script.release();
    }
  } finally {
    context.release();
    isolate.dispose();
  }
};
