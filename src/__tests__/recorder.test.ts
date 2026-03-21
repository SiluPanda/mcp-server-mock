import { describe, it, expect, beforeEach } from 'vitest';
import { RequestRecorder } from '../recorder.js';

describe('RequestRecorder', () => {
  let recorder: RequestRecorder;

  beforeEach(() => {
    recorder = new RequestRecorder();
  });

  describe('recordRequest', () => {
    it('should record a request with all fields', () => {
      const record = recorder.recordRequest(
        'tools/call',
        { name: 'search', arguments: { query: 'test' } },
        1,
        { content: [{ type: 'text', text: 'result' }] },
        undefined,
        5,
      );

      expect(record.seq).toBe(1);
      expect(record.method).toBe('tools/call');
      expect(record.params).toEqual({ name: 'search', arguments: { query: 'test' } });
      expect(record.id).toBe(1);
      expect(record.response.result).toEqual({ content: [{ type: 'text', text: 'result' }] });
      expect(record.response.error).toBeUndefined();
      expect(record.response.durationMs).toBe(5);
      expect(record.timestamp).toBeDefined();
    });

    it('should record a request with error', () => {
      const record = recorder.recordRequest(
        'tools/call',
        { name: 'fail' },
        2,
        undefined,
        { code: -32603, message: 'Internal error' },
        10,
      );

      expect(record.response.result).toBeUndefined();
      expect(record.response.error).toEqual({ code: -32603, message: 'Internal error' });
    });

    it('should auto-increment sequence numbers', () => {
      const r1 = recorder.recordRequest('tools/call', {}, 1, {}, undefined, 0);
      const r2 = recorder.recordRequest('tools/list', {}, 2, {}, undefined, 0);
      const r3 = recorder.recordRequest('resources/read', {}, 3, {}, undefined, 0);

      expect(r1.seq).toBe(1);
      expect(r2.seq).toBe(2);
      expect(r3.seq).toBe(3);
    });

    it('should include ISO 8601 timestamp', () => {
      const record = recorder.recordRequest('ping', {}, 1, {}, undefined, 0);
      expect(() => new Date(record.timestamp)).not.toThrow();
      expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('recordNotification', () => {
    it('should record an incoming notification', () => {
      const record = recorder.recordNotification(
        'notifications/initialized',
        undefined,
        'incoming',
      );

      expect(record.seq).toBe(1);
      expect(record.method).toBe('notifications/initialized');
      expect(record.params).toBeUndefined();
      expect(record.direction).toBe('incoming');
    });

    it('should record an outgoing notification', () => {
      const record = recorder.recordNotification(
        'notifications/tools/list_changed',
        {},
        'outgoing',
      );

      expect(record.direction).toBe('outgoing');
    });

    it('should auto-increment notification sequence independently', () => {
      recorder.recordRequest('ping', {}, 1, {}, undefined, 0);
      const n1 = recorder.recordNotification('a', undefined, 'incoming');
      const n2 = recorder.recordNotification('b', undefined, 'outgoing');

      expect(n1.seq).toBe(1);
      expect(n2.seq).toBe(2);
    });
  });

  describe('requests', () => {
    it('should return all recorded requests', () => {
      recorder.recordRequest('tools/call', { name: 'a' }, 1, {}, undefined, 0);
      recorder.recordRequest('tools/call', { name: 'b' }, 2, {}, undefined, 0);

      expect(recorder.requests).toHaveLength(2);
    });

    it('should return readonly array', () => {
      const requests = recorder.requests;
      expect(Array.isArray(requests)).toBe(true);
    });
  });

  describe('notifications', () => {
    it('should return all recorded notifications', () => {
      recorder.recordNotification('a', undefined, 'incoming');
      recorder.recordNotification('b', undefined, 'outgoing');

      expect(recorder.notifications).toHaveLength(2);
    });
  });

  describe('requestsFor', () => {
    it('should filter requests by method', () => {
      recorder.recordRequest('tools/call', { name: 'a' }, 1, {}, undefined, 0);
      recorder.recordRequest('resources/read', { uri: 'x' }, 2, {}, undefined, 0);
      recorder.recordRequest('tools/call', { name: 'b' }, 3, {}, undefined, 0);

      const toolCalls = recorder.requestsFor('tools/call');
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].params.name).toBe('a');
      expect(toolCalls[1].params.name).toBe('b');
    });

    it('should return empty array for unmatched method', () => {
      recorder.recordRequest('tools/call', {}, 1, {}, undefined, 0);
      expect(recorder.requestsFor('prompts/get')).toHaveLength(0);
    });
  });

  describe('toolCalls', () => {
    it('should filter tool calls by tool name', () => {
      recorder.recordRequest('tools/call', { name: 'search', arguments: { q: '1' } }, 1, {}, undefined, 0);
      recorder.recordRequest('tools/call', { name: 'fetch', arguments: {} }, 2, {}, undefined, 0);
      recorder.recordRequest('tools/call', { name: 'search', arguments: { q: '2' } }, 3, {}, undefined, 0);

      const calls = recorder.toolCalls('search');
      expect(calls).toHaveLength(2);
    });

    it('should return empty for non-existent tool', () => {
      expect(recorder.toolCalls('nonexistent')).toHaveLength(0);
    });
  });

  describe('resourceReads', () => {
    it('should filter resource reads by URI', () => {
      recorder.recordRequest('resources/read', { uri: 'file:///a.txt' }, 1, {}, undefined, 0);
      recorder.recordRequest('resources/read', { uri: 'file:///b.txt' }, 2, {}, undefined, 0);

      expect(recorder.resourceReads('file:///a.txt')).toHaveLength(1);
    });
  });

  describe('promptGets', () => {
    it('should filter prompt gets by name', () => {
      recorder.recordRequest('prompts/get', { name: 'review' }, 1, {}, undefined, 0);
      recorder.recordRequest('prompts/get', { name: 'summarize' }, 2, {}, undefined, 0);

      expect(recorder.promptGets('review')).toHaveLength(1);
    });
  });

  describe('lastRequests', () => {
    it('should return the last N requests', () => {
      recorder.recordRequest('a', {}, 1, {}, undefined, 0);
      recorder.recordRequest('b', {}, 2, {}, undefined, 0);
      recorder.recordRequest('c', {}, 3, {}, undefined, 0);

      const last2 = recorder.lastRequests(2);
      expect(last2).toHaveLength(2);
      expect(last2[0].method).toBe('b');
      expect(last2[1].method).toBe('c');
    });

    it('should return all if N is larger than count', () => {
      recorder.recordRequest('a', {}, 1, {}, undefined, 0);
      expect(recorder.lastRequests(10)).toHaveLength(1);
    });
  });

  describe('requestCount', () => {
    it('should return 0 initially', () => {
      expect(recorder.requestCount).toBe(0);
    });

    it('should count recorded requests', () => {
      recorder.recordRequest('a', {}, 1, {}, undefined, 0);
      recorder.recordRequest('b', {}, 2, {}, undefined, 0);
      expect(recorder.requestCount).toBe(2);
    });
  });

  describe('reset', () => {
    it('should clear all recordings', () => {
      recorder.recordRequest('a', {}, 1, {}, undefined, 0);
      recorder.recordNotification('b', undefined, 'incoming');

      recorder.reset();

      expect(recorder.requests).toHaveLength(0);
      expect(recorder.notifications).toHaveLength(0);
      expect(recorder.requestCount).toBe(0);
    });

    it('should reset sequence numbers', () => {
      recorder.recordRequest('a', {}, 1, {}, undefined, 0);
      recorder.reset();
      const record = recorder.recordRequest('b', {}, 2, {}, undefined, 0);
      expect(record.seq).toBe(1);
    });
  });
});
