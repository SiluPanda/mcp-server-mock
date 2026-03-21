import type { RecordedRequest } from './types.js';
import { RequestRecorder } from './recorder.js';

/**
 * Assertion helpers for verifying mock server interactions.
 * All assertion methods throw descriptive errors when expectations are not met.
 */
export class AssertionHelper {
  constructor(private readonly recorder: RequestRecorder) {}

  /** Assert that a tool was called. Optionally assert exact call count. */
  assertToolCalled(toolName: string, times?: number): void {
    const calls = this.recorder.toolCalls(toolName);
    if (times !== undefined) {
      if (calls.length !== times) {
        const callSummary = this.formatCalls(calls);
        throw new Error(
          `Expected tool "${toolName}" to be called ${times} time(s), but it was called ${calls.length} time(s).${callSummary}`,
        );
      }
    } else {
      if (calls.length === 0) {
        throw new Error(
          `Expected tool "${toolName}" to be called at least once, but it was never called.`,
        );
      }
    }
  }

  /** Assert that a tool was called with specific arguments (deep equality). */
  assertToolCalledWith(toolName: string, args: Record<string, unknown>): void {
    const calls = this.recorder.toolCalls(toolName);
    if (calls.length === 0) {
      throw new Error(
        `Expected tool "${toolName}" to be called with ${JSON.stringify(args)}, but it was never called.`,
      );
    }

    const hasMatch = calls.some((call) =>
      deepEqual(call.params?.arguments as Record<string, unknown>, args),
    );

    if (!hasMatch) {
      const callSummary = this.formatCallArgs(calls);
      throw new Error(
        `Expected tool "${toolName}" to be called with ${JSON.stringify(args)}, but no matching call was found.${callSummary}`,
      );
    }
  }

  /** Assert that a tool was never called. */
  assertToolNotCalled(toolName: string): void {
    const calls = this.recorder.toolCalls(toolName);
    if (calls.length > 0) {
      throw new Error(
        `Expected tool "${toolName}" to never be called, but it was called ${calls.length} time(s).`,
      );
    }
  }

  /** Assert that a resource was read. Optionally assert exact count. */
  assertResourceRead(uri: string, times?: number): void {
    const reads = this.recorder.resourceReads(uri);
    if (times !== undefined) {
      if (reads.length !== times) {
        throw new Error(
          `Expected resource "${uri}" to be read ${times} time(s), but it was read ${reads.length} time(s).`,
        );
      }
    } else {
      if (reads.length === 0) {
        throw new Error(
          `Expected resource "${uri}" to be read at least once, but it was never read.`,
        );
      }
    }
  }

  /** Assert that a prompt was retrieved. Optionally assert exact count. */
  assertPromptRetrieved(promptName: string, times?: number): void {
    const gets = this.recorder.promptGets(promptName);
    if (times !== undefined) {
      if (gets.length !== times) {
        throw new Error(
          `Expected prompt "${promptName}" to be retrieved ${times} time(s), but it was retrieved ${gets.length} time(s).`,
        );
      }
    } else {
      if (gets.length === 0) {
        throw new Error(
          `Expected prompt "${promptName}" to be retrieved at least once, but it was never retrieved.`,
        );
      }
    }
  }

  /** Assert that a method was called. Optionally assert exact count. */
  assertMethodCalled(method: string, times?: number): void {
    const calls = this.recorder.requestsFor(method);
    if (times !== undefined) {
      if (calls.length !== times) {
        throw new Error(
          `Expected method "${method}" to be called ${times} time(s), but it was called ${calls.length} time(s).`,
        );
      }
    } else {
      if (calls.length === 0) {
        throw new Error(
          `Expected method "${method}" to be called at least once, but it was never called.`,
        );
      }
    }
  }

  /** Assert that no requests were received. */
  assertNoRequests(): void {
    const count = this.recorder.requestCount;
    if (count > 0) {
      throw new Error(
        `Expected no requests, but ${count} request(s) were received.`,
      );
    }
  }

  /** Assert the total number of requests received. */
  assertRequestCount(count: number): void {
    const actual = this.recorder.requestCount;
    if (actual !== count) {
      throw new Error(
        `Expected ${count} request(s), but ${actual} request(s) were received.`,
      );
    }
  }

  /** Format call details for error messages. */
  private formatCalls(calls: ReadonlyArray<RecordedRequest>): string {
    if (calls.length === 0) return '';
    const lines = calls.map(
      (c) =>
        `  [${c.seq}] ${c.params?.name ?? c.method}(${JSON.stringify(c.params?.arguments ?? {})}) at ${c.timestamp}`,
    );
    return '\n  Actual calls:\n' + lines.join('\n');
  }

  /** Format call arguments for error messages. */
  private formatCallArgs(calls: ReadonlyArray<RecordedRequest>): string {
    if (calls.length === 0) return '';
    const lines = calls.map(
      (c) =>
        `  [${c.seq}] ${c.params?.name ?? c.method}(${JSON.stringify(c.params?.arguments ?? {})}) at ${c.timestamp}`,
    );
    return '\n  Actual calls:\n' + lines.join('\n');
  }
}

/** Deep equality check for argument matching. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}
