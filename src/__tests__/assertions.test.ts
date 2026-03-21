import { describe, it, expect, beforeEach } from 'vitest';
import { AssertionHelper } from '../assertions.js';
import { RequestRecorder } from '../recorder.js';

describe('AssertionHelper', () => {
  let recorder: RequestRecorder;
  let assertions: AssertionHelper;

  beforeEach(() => {
    recorder = new RequestRecorder();
    assertions = new AssertionHelper(recorder);
  });

  // ── assertToolCalled ───────────────────────────────────────────────

  describe('assertToolCalled', () => {
    it('should pass when tool was called at least once', () => {
      recorder.recordRequest('tools/call', { name: 'search', arguments: {} }, 1, {}, undefined, 0);
      expect(() => assertions.assertToolCalled('search')).not.toThrow();
    });

    it('should throw when tool was never called', () => {
      expect(() => assertions.assertToolCalled('search')).toThrow(
        'Expected tool "search" to be called at least once, but it was never called.',
      );
    });

    it('should pass when tool was called exact number of times', () => {
      recorder.recordRequest('tools/call', { name: 'search', arguments: {} }, 1, {}, undefined, 0);
      recorder.recordRequest('tools/call', { name: 'search', arguments: {} }, 2, {}, undefined, 0);
      expect(() => assertions.assertToolCalled('search', 2)).not.toThrow();
    });

    it('should throw when call count does not match', () => {
      recorder.recordRequest('tools/call', { name: 'search', arguments: {} }, 1, {}, undefined, 0);
      expect(() => assertions.assertToolCalled('search', 3)).toThrow(
        'Expected tool "search" to be called 3 time(s), but it was called 1 time(s).',
      );
    });

    it('should include call details in error message', () => {
      recorder.recordRequest('tools/call', { name: 'search', arguments: { q: 'test' } }, 1, {}, undefined, 0);
      try {
        assertions.assertToolCalled('search', 0);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Actual calls:');
        expect((err as Error).message).toContain('search');
      }
    });
  });

  // ── assertToolCalledWith ───────────────────────────────────────────

  describe('assertToolCalledWith', () => {
    it('should pass when matching call exists', () => {
      recorder.recordRequest('tools/call', { name: 'search', arguments: { query: 'ts' } }, 1, {}, undefined, 0);
      expect(() => assertions.assertToolCalledWith('search', { query: 'ts' })).not.toThrow();
    });

    it('should throw when tool was never called', () => {
      expect(() => assertions.assertToolCalledWith('search', { query: 'ts' })).toThrow(
        'Expected tool "search" to be called with {"query":"ts"}, but it was never called.',
      );
    });

    it('should throw when no matching arguments found', () => {
      recorder.recordRequest('tools/call', { name: 'search', arguments: { query: 'rust' } }, 1, {}, undefined, 0);
      expect(() => assertions.assertToolCalledWith('search', { query: 'ts' })).toThrow(
        'no matching call was found',
      );
    });

    it('should match deeply nested arguments', () => {
      recorder.recordRequest('tools/call', {
        name: 'search',
        arguments: { filter: { type: 'exact', value: 'test' } },
      }, 1, {}, undefined, 0);

      expect(() => assertions.assertToolCalledWith('search', {
        filter: { type: 'exact', value: 'test' },
      })).not.toThrow();
    });

    it('should fail on partial match', () => {
      recorder.recordRequest('tools/call', {
        name: 'search',
        arguments: { query: 'test', limit: 10 },
      }, 1, {}, undefined, 0);

      // Exact match requires all keys
      expect(() => assertions.assertToolCalledWith('search', { query: 'test' })).toThrow();
    });
  });

  // ── assertToolNotCalled ────────────────────────────────────────────

  describe('assertToolNotCalled', () => {
    it('should pass when tool was never called', () => {
      expect(() => assertions.assertToolNotCalled('delete')).not.toThrow();
    });

    it('should throw when tool was called', () => {
      recorder.recordRequest('tools/call', { name: 'delete', arguments: {} }, 1, {}, undefined, 0);
      expect(() => assertions.assertToolNotCalled('delete')).toThrow(
        'Expected tool "delete" to never be called, but it was called 1 time(s).',
      );
    });
  });

  // ── assertResourceRead ─────────────────────────────────────────────

  describe('assertResourceRead', () => {
    it('should pass when resource was read', () => {
      recorder.recordRequest('resources/read', { uri: 'file:///a.txt' }, 1, {}, undefined, 0);
      expect(() => assertions.assertResourceRead('file:///a.txt')).not.toThrow();
    });

    it('should throw when resource was never read', () => {
      expect(() => assertions.assertResourceRead('file:///a.txt')).toThrow(
        'Expected resource "file:///a.txt" to be read at least once, but it was never read.',
      );
    });

    it('should check exact read count', () => {
      recorder.recordRequest('resources/read', { uri: 'file:///a.txt' }, 1, {}, undefined, 0);
      recorder.recordRequest('resources/read', { uri: 'file:///a.txt' }, 2, {}, undefined, 0);
      expect(() => assertions.assertResourceRead('file:///a.txt', 2)).not.toThrow();
      expect(() => assertions.assertResourceRead('file:///a.txt', 3)).toThrow();
    });
  });

  // ── assertPromptRetrieved ──────────────────────────────────────────

  describe('assertPromptRetrieved', () => {
    it('should pass when prompt was retrieved', () => {
      recorder.recordRequest('prompts/get', { name: 'review' }, 1, {}, undefined, 0);
      expect(() => assertions.assertPromptRetrieved('review')).not.toThrow();
    });

    it('should throw when prompt was never retrieved', () => {
      expect(() => assertions.assertPromptRetrieved('review')).toThrow(
        'Expected prompt "review" to be retrieved at least once, but it was never retrieved.',
      );
    });

    it('should check exact retrieval count', () => {
      recorder.recordRequest('prompts/get', { name: 'review' }, 1, {}, undefined, 0);
      expect(() => assertions.assertPromptRetrieved('review', 1)).not.toThrow();
      expect(() => assertions.assertPromptRetrieved('review', 2)).toThrow();
    });
  });

  // ── assertMethodCalled ─────────────────────────────────────────────

  describe('assertMethodCalled', () => {
    it('should pass when method was called', () => {
      recorder.recordRequest('initialize', {}, 1, {}, undefined, 0);
      expect(() => assertions.assertMethodCalled('initialize')).not.toThrow();
    });

    it('should throw when method was never called', () => {
      expect(() => assertions.assertMethodCalled('initialize')).toThrow(
        'Expected method "initialize" to be called at least once, but it was never called.',
      );
    });

    it('should check exact count', () => {
      recorder.recordRequest('ping', {}, 1, {}, undefined, 0);
      recorder.recordRequest('ping', {}, 2, {}, undefined, 0);
      expect(() => assertions.assertMethodCalled('ping', 2)).not.toThrow();
      expect(() => assertions.assertMethodCalled('ping', 1)).toThrow();
    });
  });

  // ── assertNoRequests ───────────────────────────────────────────────

  describe('assertNoRequests', () => {
    it('should pass when no requests received', () => {
      expect(() => assertions.assertNoRequests()).not.toThrow();
    });

    it('should throw when requests were received', () => {
      recorder.recordRequest('ping', {}, 1, {}, undefined, 0);
      expect(() => assertions.assertNoRequests()).toThrow(
        'Expected no requests, but 1 request(s) were received.',
      );
    });
  });

  // ── assertRequestCount ─────────────────────────────────────────────

  describe('assertRequestCount', () => {
    it('should pass when count matches', () => {
      recorder.recordRequest('a', {}, 1, {}, undefined, 0);
      recorder.recordRequest('b', {}, 2, {}, undefined, 0);
      expect(() => assertions.assertRequestCount(2)).not.toThrow();
    });

    it('should throw when count does not match', () => {
      recorder.recordRequest('a', {}, 1, {}, undefined, 0);
      expect(() => assertions.assertRequestCount(0)).toThrow(
        'Expected 0 request(s), but 1 request(s) were received.',
      );
    });
  });
});
