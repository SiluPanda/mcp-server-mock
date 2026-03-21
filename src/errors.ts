import type { MockError } from './types.js';

/** Pre-built error factories for common JSON-RPC errors. */
export const MockErrors = {
  /** Method not found (-32601). */
  methodNotFound(method?: string): MockError {
    return {
      code: -32601,
      message: method ? `Method not found: ${method}` : 'Method not found',
    };
  },

  /** Invalid params (-32602). */
  invalidParams(message?: string): MockError {
    return {
      code: -32602,
      message: message ?? 'Invalid params',
    };
  },

  /** Internal error (-32603). */
  internalError(message?: string): MockError {
    return {
      code: -32603,
      message: message ?? 'Internal error',
    };
  },

  /** Parse error (-32700). */
  parseError(): MockError {
    return {
      code: -32700,
      message: 'Parse error',
    };
  },

  /** Invalid request (-32600). */
  invalidRequest(message?: string): MockError {
    return {
      code: -32600,
      message: message ?? 'Invalid request',
    };
  },

  /** Custom application error. */
  custom(code: number, message: string, data?: unknown): MockError {
    return { code, message, data };
  },
};
