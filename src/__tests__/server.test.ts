import { describe, it, expect, beforeEach } from 'vitest';
import { MockMCPServer, createMockServer } from '../server.js';
import { MockErrors } from '../errors.js';
import type { JsonRpcRequest, JsonRpcNotification } from '../types.js';

function req(method: string, params?: Record<string, unknown>, id: number | string = 1): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params };
}

function notif(method: string, params?: Record<string, unknown>): JsonRpcNotification {
  return { jsonrpc: '2.0', method, params };
}

describe('MockMCPServer', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = new MockMCPServer({ name: 'test', version: '1.0.0' });
  });

  // ── Initialization ─────────────────────────────────────────────────

  describe('initialization', () => {
    it('should handle initialize request', async () => {
      const response = await server.handleRequest(req('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      }));

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();

      const result = response.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2025-03-26');
      expect(result.serverInfo).toEqual({ name: 'test', version: '1.0.0' });
      expect(result.capabilities).toBeDefined();
    });

    it('should reject non-initialize requests before initialization', async () => {
      const response = await server.handleRequest(req('tools/list'));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32600);
      expect(response.error!.message).toContain('not initialized');
    });

    it('should allow requests after initialize + initialized notification', async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));

      const response = await server.handleRequest(req('ping', {}, 2));
      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({});
    });

    it('should skip initialization check when enforceInitialization is false', async () => {
      const s = new MockMCPServer({
        name: 'test',
        version: '1.0.0',
        enforceInitialization: false,
      });

      const response = await s.handleRequest(req('ping'));
      expect(response.error).toBeUndefined();
    });

    it('should use custom protocol version', async () => {
      const s = new MockMCPServer({
        name: 'test',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
      });

      const response = await s.handleRequest(req('initialize', {}));
      const result = response.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2024-11-05');
    });

    it('should derive capabilities from registered handlers', async () => {
      server.tool('search', { description: 'Search' }).returns({
        content: [{ type: 'text', text: 'ok' }],
      });
      server.resource('file:///a', { name: 'A' }).returns({
        contents: [{ uri: 'file:///a', text: 'content' }],
      });

      const response = await server.handleRequest(req('initialize', {}));
      const result = response.result as Record<string, unknown>;
      const caps = result.capabilities as Record<string, unknown>;

      expect(caps.tools).toEqual({ listChanged: true });
      expect(caps.resources).toEqual({ subscribe: true, listChanged: true });
      expect(caps.logging).toEqual({});
    });
  });

  // ── Tool Operations ────────────────────────────────────────────────

  describe('tool operations', () => {
    beforeEach(async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should list registered tools', async () => {
      server.tool('search', {
        description: 'Search tool',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      }).returns({ content: [{ type: 'text', text: 'result' }] });

      const response = await server.handleRequest(req('tools/list', {}, 2));
      const result = response.result as { tools: Array<Record<string, unknown>> };

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('search');
      expect(result.tools[0].description).toBe('Search tool');
    });

    it('should call a tool with static response', async () => {
      server.tool('greet').returns({
        content: [{ type: 'text', text: 'Hello!' }],
      });

      const response = await server.handleRequest(req('tools/call', {
        name: 'greet',
        arguments: {},
      }, 2));

      expect(response.error).toBeUndefined();
      const result = response.result as { content: Array<Record<string, unknown>> };
      expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
    });

    it('should call a tool with dynamic handler', async () => {
      server.tool('add', {
        inputSchema: {
          type: 'object',
          properties: { a: { type: 'number' }, b: { type: 'number' } },
        },
      }).handlerFn((args) => ({
        content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }],
      }));

      const response = await server.handleRequest(req('tools/call', {
        name: 'add',
        arguments: { a: 3, b: 5 },
      }, 2));

      const result = response.result as { content: Array<Record<string, unknown>> };
      expect(result.content[0]).toEqual({ type: 'text', text: '8' });
    });

    it('should return error for non-existent tool', async () => {
      const response = await server.handleRequest(req('tools/call', {
        name: 'nonexistent',
      }, 2));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
      expect(response.error!.message).toContain('Tool not found');
    });

    it('should return error when tool is configured to throw', async () => {
      server.tool('fail').throws(MockErrors.internalError('kaboom'));

      const response = await server.handleRequest(req('tools/call', {
        name: 'fail',
        arguments: {},
      }, 2));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32603);
      expect(response.error!.message).toBe('kaboom');
    });

    it('should handle tool with isError flag', async () => {
      server.tool('fail_gracefully').returns({
        content: [{ type: 'text', text: 'Something went wrong' }],
        isError: true,
      });

      const response = await server.handleRequest(req('tools/call', {
        name: 'fail_gracefully',
        arguments: {},
      }, 2));

      const result = response.result as { content: Array<Record<string, unknown>>; isError: boolean };
      expect(result.isError).toBe(true);
    });

    it('should exhaust tool after N calls', async () => {
      server.tool('limited').returns({
        content: [{ type: 'text', text: 'ok' }],
      }).times(2);

      const r1 = await server.handleRequest(req('tools/call', { name: 'limited', arguments: {} }, 1));
      expect(r1.error).toBeUndefined();

      const r2 = await server.handleRequest(req('tools/call', { name: 'limited', arguments: {} }, 2));
      expect(r2.error).toBeUndefined();

      const r3 = await server.handleRequest(req('tools/call', { name: 'limited', arguments: {} }, 3));
      expect(r3.error).toBeDefined();
      expect(r3.error!.message).toContain('exhausted');
    });

    it('should return error when tool name is missing', async () => {
      const response = await server.handleRequest(req('tools/call', {}, 2));
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32602);
    });
  });

  // ── Resource Operations ────────────────────────────────────────────

  describe('resource operations', () => {
    beforeEach(async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should list registered resources', async () => {
      server.resource('file:///config.json', {
        name: 'Config',
        description: 'App config',
        mimeType: 'application/json',
      }).returns({
        contents: [{ uri: 'file:///config.json', text: '{}' }],
      });

      const response = await server.handleRequest(req('resources/list', {}, 2));
      const result = response.result as { resources: Array<Record<string, unknown>> };

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe('file:///config.json');
      expect(result.resources[0].name).toBe('Config');
    });

    it('should read a resource', async () => {
      server.resource('file:///a.txt', { name: 'A' }).returns({
        contents: [{ uri: 'file:///a.txt', text: 'content here' }],
      });

      const response = await server.handleRequest(req('resources/read', {
        uri: 'file:///a.txt',
      }, 2));

      const result = response.result as { contents: Array<Record<string, unknown>> };
      expect(result.contents[0].text).toBe('content here');
    });

    it('should return error for non-existent resource', async () => {
      const response = await server.handleRequest(req('resources/read', {
        uri: 'file:///nonexistent',
      }, 2));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
    });

    it('should handle resource templates list', async () => {
      server.resourceTemplate({
        name: 'User',
        uriTemplate: 'db://users/{id}',
        description: 'User by ID',
      });

      const response = await server.handleRequest(req('resources/templates/list', {}, 2));
      const result = response.result as { resourceTemplates: Array<Record<string, unknown>> };

      expect(result.resourceTemplates).toHaveLength(1);
      expect(result.resourceTemplates[0].uriTemplate).toBe('db://users/{id}');
    });

    it('should handle subscribe/unsubscribe', async () => {
      const r1 = await server.handleRequest(req('resources/subscribe', { uri: 'file:///a' }, 2));
      expect(r1.error).toBeUndefined();

      const r2 = await server.handleRequest(req('resources/unsubscribe', { uri: 'file:///a' }, 3));
      expect(r2.error).toBeUndefined();
    });

    it('should return error when URI is missing', async () => {
      const response = await server.handleRequest(req('resources/read', {}, 2));
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32602);
    });
  });

  // ── Prompt Operations ──────────────────────────────────────────────

  describe('prompt operations', () => {
    beforeEach(async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should list registered prompts', async () => {
      server.prompt('review', {
        description: 'Code review',
        arguments: [{ name: 'language', required: true }],
      }).returns({
        messages: [{ role: 'user', content: { type: 'text', text: 'Review this code.' } }],
      });

      const response = await server.handleRequest(req('prompts/list', {}, 2));
      const result = response.result as { prompts: Array<Record<string, unknown>> };

      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].name).toBe('review');
    });

    it('should get a prompt', async () => {
      server.prompt('review').returns({
        messages: [{ role: 'user', content: { type: 'text', text: 'Review this.' } }],
      });

      const response = await server.handleRequest(req('prompts/get', {
        name: 'review',
        arguments: { language: 'typescript' },
      }, 2));

      const result = response.result as { messages: Array<Record<string, unknown>> };
      expect(result.messages).toHaveLength(1);
    });

    it('should return error for non-existent prompt', async () => {
      const response = await server.handleRequest(req('prompts/get', {
        name: 'nonexistent',
      }, 2));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
    });
  });

  // ── Ping ───────────────────────────────────────────────────────────

  describe('ping', () => {
    it('should respond to ping', async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));

      const response = await server.handleRequest(req('ping', {}, 2));
      expect(response.result).toEqual({});
      expect(response.error).toBeUndefined();
    });
  });

  // ── Logging ────────────────────────────────────────────────────────

  describe('logging', () => {
    it('should handle logging/setLevel', async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));

      const response = await server.handleRequest(req('logging/setLevel', {
        level: 'debug',
      }, 2));

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({});
    });
  });

  // ── Unknown Method ─────────────────────────────────────────────────

  describe('unknown method', () => {
    it('should return method not found for unknown methods', async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));

      const response = await server.handleRequest(req('unknown/method', {}, 2));
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
    });
  });

  // ── Notifications ──────────────────────────────────────────────────

  describe('notifications', () => {
    it('should record incoming notifications', () => {
      server.handleNotification(notif('notifications/initialized'));
      expect(server.notifications).toHaveLength(1);
      expect(server.notifications[0].method).toBe('notifications/initialized');
      expect(server.notifications[0].direction).toBe('incoming');
    });

    it('should not record when recordNotifications is false', () => {
      const s = new MockMCPServer({
        name: 'test',
        version: '1.0.0',
        recordNotifications: false,
      });

      s.handleNotification(notif('notifications/initialized'));
      expect(s.notifications).toHaveLength(0);
    });
  });

  // ── Request Recording ──────────────────────────────────────────────

  describe('request recording', () => {
    beforeEach(async () => {
      server.tool('search').returns({ content: [{ type: 'text', text: 'found' }] });
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should record all requests', async () => {
      await server.handleRequest(req('tools/call', { name: 'search', arguments: { q: 'test' } }, 2));
      await server.handleRequest(req('tools/list', {}, 3));

      expect(server.requests).toHaveLength(3); // initialize + 2
    });

    it('should filter by method', async () => {
      await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 2));
      await server.handleRequest(req('tools/list', {}, 3));

      expect(server.requestsFor('tools/call')).toHaveLength(1);
      expect(server.requestsFor('tools/list')).toHaveLength(1);
    });

    it('should filter tool calls by name', async () => {
      server.tool('fetch').returns({ content: [{ type: 'text', text: 'data' }] });

      await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 2));
      await server.handleRequest(req('tools/call', { name: 'fetch', arguments: {} }, 3));
      await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 4));

      expect(server.toolCalls('search')).toHaveLength(2);
      expect(server.toolCalls('fetch')).toHaveLength(1);
    });

    it('should filter resource reads by URI', async () => {
      server.resource('file:///a', { name: 'A' }).returns({ contents: [{ uri: 'file:///a', text: 'a' }] });
      server.resource('file:///b', { name: 'B' }).returns({ contents: [{ uri: 'file:///b', text: 'b' }] });

      await server.handleRequest(req('resources/read', { uri: 'file:///a' }, 2));
      await server.handleRequest(req('resources/read', { uri: 'file:///b' }, 3));

      expect(server.resourceReads('file:///a')).toHaveLength(1);
    });

    it('should filter prompt gets by name', async () => {
      server.prompt('review').returns({
        messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
      });

      await server.handleRequest(req('prompts/get', { name: 'review' }, 2));
      expect(server.promptGets('review')).toHaveLength(1);
    });

    it('should record error responses', async () => {
      await server.handleRequest(req('tools/call', { name: 'nonexistent' }, 2));

      const calls = server.requestsFor('tools/call');
      expect(calls).toHaveLength(1);
      expect(calls[0].response.error).toBeDefined();
    });

    it('should reset recordings', async () => {
      await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 2));
      server.resetRecordings();
      expect(server.requests).toHaveLength(0);
    });
  });

  // ── Assertions ─────────────────────────────────────────────────────

  describe('assertions', () => {
    beforeEach(async () => {
      server.tool('search').returns({ content: [{ type: 'text', text: 'found' }] });
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('assertToolCalled should pass when tool is called', async () => {
      await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 2));
      expect(() => server.assertToolCalled('search')).not.toThrow();
    });

    it('assertToolCalled should throw when tool is not called', () => {
      expect(() => server.assertToolCalled('search')).toThrow();
    });

    it('assertToolCalledWith should match arguments', async () => {
      await server.handleRequest(req('tools/call', { name: 'search', arguments: { q: 'test' } }, 2));
      expect(() => server.assertToolCalledWith('search', { q: 'test' })).not.toThrow();
    });

    it('assertToolNotCalled should pass when tool is not called', () => {
      expect(() => server.assertToolNotCalled('search')).not.toThrow();
    });

    it('assertToolNotCalled should throw when tool is called', async () => {
      await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 2));
      expect(() => server.assertToolNotCalled('search')).toThrow();
    });

    it('assertMethodCalled should pass for recorded method', async () => {
      await server.handleRequest(req('tools/list', {}, 2));
      expect(() => server.assertMethodCalled('tools/list')).not.toThrow();
    });

    it('assertNoRequests should pass when no requests after reset', async () => {
      server.resetRecordings();
      expect(() => server.assertNoRequests()).not.toThrow();
    });

    it('assertRequestCount should validate count', async () => {
      await server.handleRequest(req('ping', {}, 2));
      // 1 initialize + 1 ping = 2
      expect(() => server.assertRequestCount(2)).not.toThrow();
    });

    it('assertResourceRead should pass when resource was read', async () => {
      server.resource('file:///a', { name: 'A' }).returns({ contents: [{ uri: 'file:///a', text: 'x' }] });
      await server.handleRequest(req('resources/read', { uri: 'file:///a' }, 2));
      expect(() => server.assertResourceRead('file:///a')).not.toThrow();
    });

    it('assertPromptRetrieved should pass when prompt was retrieved', async () => {
      server.prompt('review').returns({
        messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
      });
      await server.handleRequest(req('prompts/get', { name: 'review' }, 2));
      expect(() => server.assertPromptRetrieved('review')).not.toThrow();
    });
  });

  // ── Dynamic Handler Modification ───────────────────────────────────

  describe('dynamic handler modification', () => {
    beforeEach(async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should remove a tool', async () => {
      server.tool('search').returns({ content: [{ type: 'text', text: 'ok' }] });
      server.removeTool('search');

      const response = await server.handleRequest(req('tools/call', { name: 'search' }, 2));
      expect(response.error).toBeDefined();
    });

    it('should remove a resource', async () => {
      server.resource('file:///a', { name: 'A' }).returns({ contents: [{ uri: 'file:///a', text: 'x' }] });
      server.removeResource('file:///a');

      const response = await server.handleRequest(req('resources/read', { uri: 'file:///a' }, 2));
      expect(response.error).toBeDefined();
    });

    it('should remove a prompt', async () => {
      server.prompt('review').returns({
        messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
      });
      server.removePrompt('review');

      const response = await server.handleRequest(req('prompts/get', { name: 'review' }, 2));
      expect(response.error).toBeDefined();
    });
  });

  // ── Response Interceptors ──────────────────────────────────────────

  describe('response interceptors', () => {
    beforeEach(async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should intercept and modify responses', async () => {
      server.tool('search').returns({ content: [{ type: 'text', text: 'original' }] });

      server.interceptResponse('tools/call', (response) => {
        const result = response.result as Record<string, unknown>;
        result.injected = true;
        return response;
      });

      const response = await server.handleRequest(req('tools/call', {
        name: 'search', arguments: {},
      }, 2));

      const result = response.result as Record<string, unknown>;
      expect(result.injected).toBe(true);
    });
  });

  // ── Scenario Integration ───────────────────────────────────────────

  describe('scenario integration', () => {
    beforeEach(async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should transition states on matching requests', async () => {
      server.scenario({
        initialState: 'unauthenticated',
        transitions: [
          { from: 'unauthenticated', method: 'tools/call', match: { name: 'login' }, to: 'authenticated' },
          { from: 'authenticated', method: 'tools/call', match: { name: 'logout' }, to: 'unauthenticated' },
        ],
      });

      server.tool('login').inState('unauthenticated', {
        content: [{ type: 'text', text: 'Login successful' }],
      }).inState('authenticated', {
        content: [{ type: 'text', text: 'Already logged in' }],
      });

      server.tool('get_data').inState('unauthenticated', {
        content: [{ type: 'text', text: 'Not authenticated' }],
        isError: true,
      }).inState('authenticated', {
        content: [{ type: 'text', text: '{"data": [1,2,3]}' }],
      });

      server.tool('logout').inState('authenticated', {
        content: [{ type: 'text', text: 'Logged out' }],
      });

      expect(server.currentState).toBe('unauthenticated');

      // Try get_data while unauthenticated
      let response = await server.handleRequest(req('tools/call', { name: 'get_data', arguments: {} }, 2));
      let result = response.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not authenticated');

      // Login
      response = await server.handleRequest(req('tools/call', { name: 'login', arguments: {} }, 3));
      result = response.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.content[0].text).toBe('Login successful');
      expect(server.currentState).toBe('authenticated');

      // Get data while authenticated
      response = await server.handleRequest(req('tools/call', { name: 'get_data', arguments: {} }, 4));
      result = response.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.content[0].text).toBe('{"data": [1,2,3]}');

      // Logout
      response = await server.handleRequest(req('tools/call', { name: 'logout', arguments: {} }, 5));
      result = response.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.content[0].text).toBe('Logged out');
      expect(server.currentState).toBe('unauthenticated');
    });

    it('should get and set state manually', () => {
      server.scenario({
        initialState: 'idle',
        transitions: [],
      });

      expect(server.currentState).toBe('idle');
      server.setState('active');
      expect(server.currentState).toBe('active');
    });
  });

  // ── Fixture Loading ────────────────────────────────────────────────

  describe('fixture loading', () => {
    it('should load a full fixture', async () => {
      server.loadFixture({
        server: { name: 'fixture-server', version: '2.0.0' },
        tools: [
          {
            name: 'search',
            description: 'Search tool',
            inputSchema: { type: 'object' },
            response: { content: [{ type: 'text', text: 'found' }] },
          },
          {
            name: 'fail',
            error: { code: -32603, message: 'broken' },
          },
          {
            name: 'delayed',
            response: { content: [{ type: 'text', text: 'slow' }] },
            delayMs: 10,
          },
        ],
        resources: [
          {
            uri: 'file:///config',
            name: 'Config',
            response: { contents: [{ uri: 'file:///config', text: '{}' }] },
          },
        ],
        prompts: [
          {
            name: 'review',
            description: 'Review prompt',
            response: {
              messages: [{ role: 'user', content: { type: 'text', text: 'Review this.' } }],
            },
          },
        ],
        resourceTemplates: [
          { name: 'User', uriTemplate: 'db://users/{id}' },
        ],
      });

      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));

      // Tools
      const toolsResp = await server.handleRequest(req('tools/list', {}, 2));
      const tools = (toolsResp.result as { tools: Array<Record<string, unknown>> }).tools;
      expect(tools).toHaveLength(3);

      // Call search tool
      const searchResp = await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 3));
      expect(searchResp.error).toBeUndefined();

      // Call fail tool
      const failResp = await server.handleRequest(req('tools/call', { name: 'fail', arguments: {} }, 4));
      expect(failResp.error).toBeDefined();
      expect(failResp.error!.message).toBe('broken');

      // Resources
      const resResp = await server.handleRequest(req('resources/list', {}, 5));
      const resources = (resResp.result as { resources: Array<Record<string, unknown>> }).resources;
      expect(resources).toHaveLength(1);

      // Prompts
      const promptsResp = await server.handleRequest(req('prompts/list', {}, 6));
      const prompts = (promptsResp.result as { prompts: Array<Record<string, unknown>> }).prompts;
      expect(prompts).toHaveLength(1);
    });

    it('should load fixture with state-dependent responses', async () => {
      server.loadFixture({
        server: { name: 'test', version: '1.0.0' },
        tools: [
          {
            name: 'data',
            states: {
              idle: { content: [{ type: 'text', text: 'idle data' }] },
              active: { content: [{ type: 'text', text: 'active data' }] },
            },
          },
        ],
        scenario: {
          initialState: 'idle',
          transitions: [
            { from: 'idle', method: 'tools/call', match: { name: 'data' }, to: 'active' },
          ],
        },
      });

      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));

      // First call uses "idle" state for the response, then transitions to "active"
      const r1 = await server.handleRequest(req('tools/call', { name: 'data', arguments: {} }, 2));
      const result1 = (r1.result as { content: Array<{ text: string }> });
      expect(result1.content[0].text).toBe('idle data');
      expect(server.currentState).toBe('active');

      // Second call uses "active" state
      const r2 = await server.handleRequest(req('tools/call', { name: 'data', arguments: {} }, 3));
      const result2 = (r2.result as { content: Array<{ text: string }> });
      expect(result2.content[0].text).toBe('active data');
    });
  });

  // ── Completion ─────────────────────────────────────────────────────

  describe('completion', () => {
    beforeEach(async () => {
      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
    });

    it('should handle completion requests', async () => {
      server.completion((_ref, argument) => ({
        completion: {
          values: ['typescript', 'terraform'].filter(v => v.startsWith(argument.value)),
          hasMore: false,
        },
      }));

      const response = await server.handleRequest(req('completion/complete', {
        ref: { type: 'ref/prompt', name: 'review' },
        argument: { name: 'language', value: 'ty' },
      }, 2));

      expect(response.error).toBeUndefined();
      const result = response.result as { completion: { values: string[] } };
      expect(result.completion.values).toEqual(['typescript']);
    });

    it('should return error when no completion handler set', async () => {
      const response = await server.handleRequest(req('completion/complete', {
        ref: { type: 'ref/prompt', name: 'review' },
        argument: { name: 'language', value: 'ty' },
      }, 2));

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
    });
  });

  // ── Reset All ──────────────────────────────────────────────────────

  describe('resetAll', () => {
    it('should reset everything', async () => {
      server.tool('search').returns({ content: [{ type: 'text', text: 'ok' }] });
      server.resource('file:///a', { name: 'A' }).returns({ contents: [{ uri: 'file:///a', text: 'x' }] });
      server.prompt('review').returns({ messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }] });
      server.scenario({ initialState: 'idle', transitions: [] });

      await server.handleRequest(req('initialize', {}));
      server.handleNotification(notif('notifications/initialized'));
      await server.handleRequest(req('tools/call', { name: 'search', arguments: {} }, 2));

      server.resetAll();

      expect(server.requests).toHaveLength(0);
      expect(server.currentState).toBeUndefined();

      // After resetAll, initialize enforcement is reset too
      const response = await server.handleRequest(req('tools/list', {}, 3));
      expect(response.error).toBeDefined(); // not initialized
    });
  });

  // ── Close ──────────────────────────────────────────────────────────

  describe('close', () => {
    it('should close without error', async () => {
      await expect(server.close()).resolves.not.toThrow();
    });
  });

  // ── createMockServer Factory ───────────────────────────────────────

  describe('createMockServer', () => {
    it('should create a MockMCPServer instance', () => {
      const s = createMockServer({ name: 'factory-test', version: '1.0.0' });
      expect(s).toBeInstanceOf(MockMCPServer);
    });
  });
});
