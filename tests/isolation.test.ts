import assert from "node:assert/strict";
import test from "node:test";

const API_URL = "http://localhost:3000/api/execute";

async function executeCode(code: string, tenantId = "tenant-isolation") {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, tenantId }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

test("Phase 1: Real Isolation Boundaries", async (t) => {
  
  await t.test("Standard Resolution: evaluates basic math", async () => {
    const code = "let sum = 0; for(let i=1; i<=10; i++) sum += i; sum;";
    const { status, data } = await executeCode(code);
    
    assert.equal(status, 200);
    assert.equal(data.result, 55);
  });

  await t.test("Sandbox Escape: completely blocks Node built-ins", async () => {
    const code = "require('fs').readFileSync('/etc/passwd')";
    const { status, data } = await executeCode(code);
    
    assert.equal(status, 500);
    assert.match(data.error, /require is not defined/);
  });

  await t.test("Time Limit Exceeded (TLE): terminates infinite loops", async () => {
    const code = "while(true) {}";
    const { status, data } = await executeCode(code);
    
    assert.equal(status, 500);
    assert.match(data.error, /Script execution timed out/);
  });

  await t.test("Memory Limit Exceeded (MLE): worker survives and isolates the failure", async () => {
    // Allocates massive arrays in an infinite loop to breach 128MB limit
    const code = "const a = []; while(true) { a.push(new Array(1e6).fill('x')); }";
    const { status, data } = await executeCode(code);
    
    assert.equal(status, 500);
    // isolated-vm throws an isolate disposed error when memory is exhausted
    assert.match(data.error, /disposed/i); 

    // Prove the worker thread is still alive and handling new isolates
    const recoveryCode = "1 + 1";
    const recovery = await executeCode(recoveryCode);
    
    assert.equal(recovery.status, 200);
    assert.equal(recovery.data.result, 2);
  });
});
