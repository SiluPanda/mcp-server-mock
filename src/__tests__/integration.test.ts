import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockMCPServer } from '../server.js';
import { MockErrors } from '../errors.js';
import type { JsonRpcRequest, JsonRpcNotification } from '../types.js';

function req(method: string, params?: Record<string, unknown>, id: number | string = 1): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params };
}

function notif(method: string, params?: Record<string, unknown>): JsonRpcNotification {
  return { jsonrpc: '2.0', method, params };
}

describe('Integration Tests', () => {
  let server: MockMCPServer;

  beforeEach(async () => {
    server = new MockMCPServer({ name: 'integration-test', version: '1.0.0' });
    await server.handleRequest(req('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    }));
    server.handleNotification(notif('notifications/initialized'));
  });

  afterEach(async () => {
    await server.close();
  });

  // ── Full Workflow ──────────────────────────────────────────────────

  describe('full MCP workflow', () => {
    it('should support a complete tool interaction lifecycle', async () => {
      // Register tools
      server.tool('search', {
        description: 'Search the web',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      }).returns({
        content: [{ type: 'text', text: 'TypeScript is a typed superset of JavaScript' }],
      });

      server.tool('summarize', {
        description: 'Summarize text',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      }).handlerFn((args) => ({
        content: [{ type: 'text', text: `Summary of: ${args.text}` }],
      }));

      // List tools
      const listResp = await server.handleRequest(req('tools/list', {}, 2));
      const tools = (listResp.result as { tools: Array<{ name: string }> }).tools;
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name).sort()).toEqual(['search', 'summarize']);

      // Call search
      const searchResp = await server.handleRequest(req('tools/call', {
        name: 'search',
        arguments: { query: 'TypeScript' },
      }, 3));
      expect(searchResp.error).toBeUndefined();

      // Call summarize
      const summarizeResp = await server.handleRequest(req('tools/call', {
        name: 'summarize',
        arguments: { text: 'Hello world' },
      }, 4));
      const result = summarizeResp.result as { content: Array<{ text: string }> };
      expect(result.content[0].text).toBe('Summary of: Hello world');

      // Verify recordings
      server.assertToolCalled('search', 1);
      server.assertToolCalled('summarize', 1);
      server.assertToolCalledWith('search', { query: 'TypeScript' });
    });

    it('should support a complete resource workflow', async () => {
      server.resource('file:///config.json', {
        name: 'Config',
        mimeType: 'application/json',
      }).returns({
        contents: [{
          uri: 'file:///config.json',
          mimeType: 'application/json',
          text: '{"debug": true}',
        }],
      });

      server.resource('file:///data.csv', {
        name: 'Data',
        mimeType: 'text/csv',
      }).returns({
        contents: [{
          uri: 'file:///data.csv',
          mimeType: 'text/csv',
          text: 'a,b,c\n1,2,3',
        }],
      });

      // List resources
      const listResp = await server.handleRequest(req('resources/list', {}, 2));
      const resources = (listResp.result as { resources: Array<{ uri: string }> }).resources;
      expect(resources).toHaveLength(2);

      // Read config
      const readResp = await server.handleRequest(req('resources/read', {
        uri: 'file:///config.json',
      }, 3));
      const contents = (readResp.result as { contents: Array<{ text: string }> }).contents;
      expect(JSON.parse(contents[0].text)).toEqual({ debug: true });

      server.assertResourceRead('file:///config.json', 1);
    });

    it('should support a complete prompt workflow', async () => {
      server.prompt('code_review', {
        description: 'Review code',
        arguments: [
          { name: 'language', description: 'Programming language', required: true },
          { name: 'style', description: 'Review style', required: false },
        ],
      }).returns({
        description: 'Code review prompt',
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Please review the following code.' },
          },
        ],
      });

      // List prompts
      const listResp = await server.handleRequest(req('prompts/list', {}, 2));
      const prompts = (listResp.result as { prompts: Array<{ name: string }> }).prompts;
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('code_review');

      // Get prompt
      const getResp = await server.handleRequest(req('prompts/get', {
        name: 'code_review',
        arguments: { language: 'typescript', style: 'thorough' },
      }, 3));
      const result = getResp.result as { messages: Array<Record<string, unknown>> };
      expect(result.messages).toHaveLength(1);

      server.assertPromptRetrieved('code_review', 1);
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('should handle multiple error types', async () => {
      server.tool('internal_err').throws(MockErrors.internalError('crash'));
      server.tool('not_found').throws(MockErrors.methodNotFound('search'));
      server.tool('bad_params').throws(MockErrors.invalidParams('missing field'));
      server.tool('custom_err').throws(MockErrors.custom(-32000, 'rate limited', { retry: 60 }));

      const r1 = await server.handleRequest(req('tools/call', { name: 'internal_err', arguments: {} }, 2));
      expect(r1.error!.code).toBe(-32603);

      const r2 = await server.handleRequest(req('tools/call', { name: 'not_found', arguments: {} }, 3));
      expect(r2.error!.code).toBe(-32601);

      const r3 = await server.handleRequest(req('tools/call', { name: 'bad_params', arguments: {} }, 4));
      expect(r3.error!.code).toBe(-32602);

      const r4 = await server.handleRequest(req('tools/call', { name: 'custom_err', arguments: {} }, 5));
      expect(r4.error!.code).toBe(-32000);
      expect(r4.error!.data).toEqual({ retry: 60 });
    });

    it('should handle handler throwing regular Error', async () => {
      server.tool('broken').handlerFn(() => {
        throw new Error('unexpected crash');
      });

      const response = await server.handleRequest(req('tools/call', {
        name: 'broken', arguments: {},
      }, 2));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32603);
      expect(response.error!.message).toBe('unexpected crash');
    });

    it('should handle handler throwing non-Error', async () => {
      server.tool('broken').handlerFn(() => {
        throw 'string error';
      });

      const response = await server.handleRequest(req('tools/call', {
        name: 'broken', arguments: {},
      }, 2));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32603);
    });
  });

  // ── Multi-step Scenario ────────────────────────────────────────────

  describe('multi-step scenario', () => {
    it('should support full authentication scenario', async () => {
      server.scenario({
        initialState: 'unauthenticated',
        transitions: [
          { from: 'unauthenticated', method: 'tools/call', match: { name: 'login' }, to: 'authenticated' },
          { from: 'authenticated', method: 'tools/call', match: { name: 'logout' }, to: 'unauthenticated' },
        ],
      });

      server.tool('login')
        .inState('unauthenticated', { content: [{ type: 'text', text: 'Welcome!' }] })
        .inState('authenticated', { content: [{ type: 'text', text: 'Already logged in' }] });

      server.tool('get_data')
        .inState('unauthenticated', { content: [{ type: 'text', text: 'Access denied' }], isError: true })
        .inState('authenticated', { content: [{ type: 'text', text: '{"users": 42}' }] });

      server.tool('logout')
        .inState('authenticated', { content: [{ type: 'text', text: 'Goodbye' }] });

      // Step 1: Try data before login
      let r = await server.handleRequest(req('tools/call', { name: 'get_data', arguments: {} }, 2));
      expect((r.result as { isError: boolean }).isError).toBe(true);
      expect(server.currentState).toBe('unauthenticated');

      // Step 2: Login
      r = await server.handleRequest(req('tools/call', { name: 'login', arguments: { token: 'abc' } }, 3));
      expect(server.currentState).toBe('authenticated');
      expect((r.result as { content: Array<{ text: string }> }).content[0].text).toBe('Welcome!');

      // Step 3: Get data after login
      r = await server.handleRequest(req('tools/call', { name: 'get_data', arguments: {} }, 4));
      expect((r.result as { content: Array<{ text: string }> }).content[0].text).toBe('{"users": 42}');

      // Step 4: Logout
      r = await server.handleRequest(req('tools/call', { name: 'logout', arguments: {} }, 5));
      expect((r.result as { content: Array<{ text: string }> }).content[0].text).toBe('Goodbye');
      expect(server.currentState).toBe('unauthenticated');

      // Step 5: Data access denied again
      r = await server.handleRequest(req('tools/call', { name: 'get_data', arguments: {} }, 6));
      expect((r.result as { isError: boolean }).isError).toBe(true);
    });

    it('should support pipeline scenario with function matchers', async () => {
      server.scenario({
        initialState: 'start',
        transitions: [
          {
            from: 'start',
            method: 'tools/call',
            match: (params) => params.name === 'step1',
            to: 'middle',
          },
          {
            from: 'middle',
            method: 'tools/call',
            match: (params) => params.name === 'step2',
            to: 'end',
          },
        ],
      });

      server.tool('step1')
        .inState('start', { content: [{ type: 'text', text: 'step 1 done' }] });
      server.tool('step2')
        .inState('middle', { content: [{ type: 'text', text: 'step 2 done' }] });

      await server.handleRequest(req('tools/call', { name: 'step1', arguments: {} }, 2));
      expect(server.currentState).toBe('middle');

      await server.handleRequest(req('tools/call', { name: 'step2', arguments: {} }, 3));
      expect(server.currentState).toBe('end');
    });
  });

  // ── Delay and Timing ───────────────────────────────────────────────

  describe('delay and timing', () => {
    it('should apply per-tool delay', async () => {
      server.tool('slow').returns({
        content: [{ type: 'text', text: 'done' }],
      }).withDelay(50);

      const start = Date.now();
      await server.handleRequest(req('tools/call', { name: 'slow', arguments: {} }, 2));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should apply global default delay', async () => {
      const s = new MockMCPServer({
        name: 'test',
        version: '1.0.0',
        defaultDelayMs: 50,
        enforceInitialization: false,
      });
      s.tool('fast').returns({ content: [{ type: 'text', text: 'ok' }] });

      const start = Date.now();
      await s.handleRequest(req('tools/call', { name: 'fast', arguments: {} }));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should record response duration', async () => {
      server.tool('delayed').returns({
        content: [{ type: 'text', text: 'ok' }],
      }).withDelay(30);

      await server.handleRequest(req('tools/call', { name: 'delayed', arguments: {} }, 2));

      const calls = server.toolCalls('delayed');
      expect(calls[0].response.durationMs).toBeGreaterThanOrEqual(20);
    });
  });

  // ── Tool Exhaustion ────────────────────────────────────────────────

  describe('tool exhaustion', () => {
    it('should handle tool exhaustion gracefully', async () => {
      server.tool('limited').returns({
        content: [{ type: 'text', text: 'ok' }],
      }).times(1);

      const r1 = await server.handleRequest(req('tools/call', { name: 'limited', arguments: {} }, 2));
      expect(r1.error).toBeUndefined();

      const r2 = await server.handleRequest(req('tools/call', { name: 'limited', arguments: {} }, 3));
      expect(r2.error).toBeDefined();
      expect(r2.error!.message).toContain('exhausted after 1 calls');
    });
  });

  // ── Recording Reset ────────────────────────────────────────────────

  describe('recording isolation', () => {
    it('should isolate recordings between resets', async () => {
      server.tool('search').returns({ content: [{ type: 'text', text: 'ok' }] });

      await server.handleRequest(req('tools/call', { name: 'search', arguments: { q: 'first' } }, 2));
      server.assertToolCalled('search', 1);

      server.resetRecordings();
      server.assertToolNotCalled('search');

      await server.handleRequest(req('tools/call', { name: 'search', arguments: { q: 'second' } }, 3));
      server.assertToolCalled('search', 1);
      server.assertToolCalledWith('search', { q: 'second' });
    });
  });

  // ── Mixed Operations ──────────────────────────────────────────────

  describe('mixed operations', () => {
    it('should handle interleaved tool calls and resource reads', async () => {
      server.tool('transform').handlerFn((args) => ({
        content: [{ type: 'text', text: `transformed: ${args.input}` }],
      }));

      server.resource('config://app', { name: 'Config' }).returns({
        contents: [{ uri: 'config://app', text: '{"key": "value"}' }],
      });

      // Read config
      await server.handleRequest(req('resources/read', { uri: 'config://app' }, 2));

      // Transform data
      await server.handleRequest(req('tools/call', {
        name: 'transform',
        arguments: { input: 'raw data' },
      }, 3));

      // Read config again
      await server.handleRequest(req('resources/read', { uri: 'config://app' }, 4));

      server.assertResourceRead('config://app', 2);
      server.assertToolCalled('transform', 1);
      // 1 initialize + 2 resource reads + 1 tool call = 4
      server.assertRequestCount(4);
    });

    it('should handle rapid sequential requests', async () => {
      server.tool('counter').handlerFn(() => ({
        content: [{ type: 'text', text: 'ok' }],
      }));

      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          server.handleRequest(req('tools/call', {
            name: 'counter',
            arguments: { i },
          }, i + 2)),
        );
      }

      await Promise.all(promises);
      server.assertToolCalled('counter', 20);
    });
  });

  // ── Capability Override ────────────────────────────────────────────

  describe('capability override', () => {
    it('should use custom capabilities when provided', async () => {
      const s = new MockMCPServer({
        name: 'test',
        version: '1.0.0',
        capabilities: { tools: undefined, resources: {} },
      });

      const response = await s.handleRequest(req('initialize', {}));
      const result = response.result as { capabilities: Record<string, unknown> };

      expect(result.capabilities.tools).toBeUndefined();
      expect(result.capabilities.resources).toEqual({});
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle request with no params', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
      } as JsonRpcRequest);

      expect(response.error).toBeUndefined();
    });

    it('should handle string request IDs', async () => {
      const response = await server.handleRequest(req('ping', {}, 'abc-123'));
      expect(response.id).toBe('abc-123');
    });

    it('should handle tool with empty arguments', async () => {
      server.tool('no_args').returns({ content: [{ type: 'text', text: 'ok' }] });

      const response = await server.handleRequest(req('tools/call', {
        name: 'no_args',
      }, 2));

      expect(response.error).toBeUndefined();
    });

    it('should handle tool with structured content', async () => {
      server.tool('structured').returns({
        content: [{ type: 'text', text: '{"id": 1}' }],
        structuredContent: { id: 1 },
      });

      const response = await server.handleRequest(req('tools/call', {
        name: 'structured',
        arguments: {},
      }, 2));

      const result = response.result as { structuredContent: { id: number } };
      expect(result.structuredContent).toEqual({ id: 1 });
    });

    it('should handle resource with binary content', async () => {
      server.resource('file:///logo.png', { name: 'Logo', mimeType: 'image/png' }).returns({
        contents: [{
          uri: 'file:///logo.png',
          mimeType: 'image/png',
          blob: 'base64data==',
        }],
      });

      const response = await server.handleRequest(req('resources/read', {
        uri: 'file:///logo.png',
      }, 2));

      const result = response.result as { contents: Array<{ blob: string }> };
      expect(result.contents[0].blob).toBe('base64data==');
    });

    it('should handle multiple prompts with arguments', async () => {
      server.prompt('review', {
        arguments: [{ name: 'lang', required: true }],
      }).returns({
        messages: [{ role: 'user', content: { type: 'text', text: 'review' } }],
      });

      server.prompt('summarize', {
        arguments: [{ name: 'length', required: false }],
      }).returns({
        messages: [{ role: 'user', content: { type: 'text', text: 'summarize' } }],
      });

      const listResp = await server.handleRequest(req('prompts/list', {}, 2));
      const prompts = (listResp.result as { prompts: Array<{ name: string }> }).prompts;
      expect(prompts).toHaveLength(2);
    });
  });
});
