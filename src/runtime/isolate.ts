import ivm from "isolated-vm";

export const executeInIsolate = (code: string): unknown => {
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = isolate.createContextSync();

  try {
    const script = isolate.compileScriptSync(code);

    try {
      return script.runSync(context, {
        timeout: 1000,
      });
    } finally {
      script.release();
    }
  } finally {
    context.release();
    isolate.dispose();
  }
};
