import { describe, it, expect } from 'vitest';
import { MockErrors } from '../errors.js';

describe('MockErrors', () => {
  describe('methodNotFound', () => {
    it('should return -32601 error with default message', () => {
      const err = MockErrors.methodNotFound();
      expect(err.code).toBe(-32601);
      expect(err.message).toBe('Method not found');
    });

    it('should include method name in message', () => {
      const err = MockErrors.methodNotFound('tools/call');
      expect(err.message).toBe('Method not found: tools/call');
    });
  });

  describe('invalidParams', () => {
    it('should return -32602 error', () => {
      const err = MockErrors.invalidParams();
      expect(err.code).toBe(-32602);
      expect(err.message).toBe('Invalid params');
    });

    it('should use custom message', () => {
      const err = MockErrors.invalidParams('Missing field: query');
      expect(err.message).toBe('Missing field: query');
    });
  });

  describe('internalError', () => {
    it('should return -32603 error', () => {
      const err = MockErrors.internalError();
      expect(err.code).toBe(-32603);
      expect(err.message).toBe('Internal error');
    });

    it('should use custom message', () => {
      const err = MockErrors.internalError('Database crashed');
      expect(err.message).toBe('Database crashed');
    });
  });

  describe('parseError', () => {
    it('should return -32700 error', () => {
      const err = MockErrors.parseError();
      expect(err.code).toBe(-32700);
      expect(err.message).toBe('Parse error');
    });
  });

  describe('invalidRequest', () => {
    it('should return -32600 error', () => {
      const err = MockErrors.invalidRequest();
      expect(err.code).toBe(-32600);
      expect(err.message).toBe('Invalid request');
    });

    it('should use custom message', () => {
      const err = MockErrors.invalidRequest('Duplicate ID');
      expect(err.message).toBe('Duplicate ID');
    });
  });

  describe('custom', () => {
    it('should return custom error with code and message', () => {
      const err = MockErrors.custom(-32000, 'Rate limited');
      expect(err.code).toBe(-32000);
      expect(err.message).toBe('Rate limited');
      expect(err.data).toBeUndefined();
    });

    it('should include data if provided', () => {
      const err = MockErrors.custom(-32000, 'Quota exceeded', { retryAfter: 60 });
      expect(err.data).toEqual({ retryAfter: 60 });
    });
  });
});
