import { describe, it, expect, beforeEach } from 'vitest';
import { HandlerRegistry, executeHandler } from '../registry.js';
import type { RequestExtra, ToolResponse, ResourceResponse, PromptResponse, MockMCPServerInterface } from '../types.js';

const mockServer: MockMCPServerInterface = {
  currentState: undefined,
  setState: () => {},
  resetRecordings: () => {},
};

function makeExtra(state?: string): RequestExtra {
  return { state, server: mockServer };
}

describe('HandlerRegistry', () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = new HandlerRegistry();
  });

  // ── Tool Registration ──────────────────────────────────────────────

  describe('tool registration', () => {
    it('should register a tool and retrieve it', () => {
      registry.registerTool('search', { description: 'Search tool' });
      const entry = registry.getTool('search');

      expect(entry).toBeDefined();
      expect(entry!.name).toBe('search');
      expect(entry!.definition.description).toBe('Search tool');
    });

    it('should overwrite an existing tool on re-register', () => {
      registry.registerTool('search', { description: 'v1' });
      registry.registerTool('search', { description: 'v2' });

      expect(registry.getTool('search')!.definition.description).toBe('v2');
    });

    it('should remove a tool', () => {
      registry.registerTool('search', {});
      expect(registry.removeTool('search')).toBe(true);
      expect(registry.getTool('search')).toBeUndefined();
    });

    it('should return false when removing non-existent tool', () => {
      expect(registry.removeTool('nonexistent')).toBe(false);
    });

    it('should list all tools', () => {
      registry.registerTool('a', { description: 'Tool A' });
      registry.registerTool('b', { description: 'Tool B', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } });

      const list = registry.listTools();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('a');
      expect(list[0].inputSchema).toEqual({ type: 'object' }); // default
      expect(list[1].name).toBe('b');
      expect(list[1].inputSchema).toEqual({ type: 'object', properties: { x: { type: 'string' } } });
    });

    it('should include annotations in tool list when present', () => {
      registry.registerTool('tool1', {
        annotations: { readOnlyHint: true, title: 'My Tool' },
      });

      const list = registry.listTools();
      expect(list[0].annotations).toEqual({ readOnlyHint: true, title: 'My Tool' });
    });

    it('should not include annotations when not present', () => {
      registry.registerTool('tool1', {});
      const list = registry.listTools();
      expect(list[0].annotations).toBeUndefined();
    });
  });

  // ── Resource Registration ──────────────────────────────────────────

  describe('resource registration', () => {
    it('should register and retrieve a resource', () => {
      registry.registerResource('file:///a.txt', { name: 'File A', mimeType: 'text/plain' });
      const entry = registry.getResource('file:///a.txt');

      expect(entry).toBeDefined();
      expect(entry!.uri).toBe('file:///a.txt');
      expect(entry!.definition.name).toBe('File A');
    });

    it('should remove a resource', () => {
      registry.registerResource('file:///a.txt', { name: 'A' });
      expect(registry.removeResource('file:///a.txt')).toBe(true);
      expect(registry.getResource('file:///a.txt')).toBeUndefined();
    });

    it('should list resources', () => {
      registry.registerResource('file:///a.txt', { name: 'File A', mimeType: 'text/plain', description: 'A file' });
      registry.registerResource('db://users', { name: 'Users' });

      const list = registry.listResources();
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({ uri: 'file:///a.txt', name: 'File A', mimeType: 'text/plain', description: 'A file' });
      expect(list[1]).toEqual({ uri: 'db://users', name: 'Users' });
    });
  });

  // ── Resource Template Registration ─────────────────────────────────

  describe('resource template registration', () => {
    it('should register and list resource templates', () => {
      registry.registerResourceTemplate({
        name: 'User',
        uriTemplate: 'db://users/{id}',
        description: 'User by ID',
      });

      const list = registry.listResourceTemplates();
      expect(list).toHaveLength(1);
      expect(list[0].uriTemplate).toBe('db://users/{id}');
    });
  });

  // ── Prompt Registration ────────────────────────────────────────────

  describe('prompt registration', () => {
    it('should register and retrieve a prompt', () => {
      registry.registerPrompt('review', {
        description: 'Code review',
        arguments: [{ name: 'language', required: true }],
      });

      const entry = registry.getPrompt('review');
      expect(entry).toBeDefined();
      expect(entry!.definition.description).toBe('Code review');
    });

    it('should remove a prompt', () => {
      registry.registerPrompt('review', {});
      expect(registry.removePrompt('review')).toBe(true);
      expect(registry.getPrompt('review')).toBeUndefined();
    });

    it('should list prompts', () => {
      registry.registerPrompt('review', {
        description: 'Code review',
        arguments: [{ name: 'language', required: true }],
      });
      registry.registerPrompt('summarize', { description: 'Summarize text' });

      const list = registry.listPrompts();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('review');
      expect(list[0].arguments).toEqual([{ name: 'language', required: true }]);
    });
  });

  // ── Completion Handler ─────────────────────────────────────────────

  describe('completion handler', () => {
    it('should set and get completion handler', () => {
      const handler = () => ({ completion: { values: ['a', 'b'] } });
      registry.setCompletionHandler(handler);
      expect(registry.completionHandler).toBe(handler);
    });
  });

  // ── Capability Derivation ──────────────────────────────────────────

  describe('deriveCapabilities', () => {
    it('should return logging by default', () => {
      const caps = registry.deriveCapabilities();
      expect(caps.logging).toEqual({});
      expect(caps.tools).toBeUndefined();
      expect(caps.resources).toBeUndefined();
      expect(caps.prompts).toBeUndefined();
    });

    it('should include tools when tools are registered', () => {
      registry.registerTool('a', {});
      const caps = registry.deriveCapabilities();
      expect(caps.tools).toEqual({ listChanged: true });
    });

    it('should include resources when resources are registered', () => {
      registry.registerResource('file:///a', { name: 'A' });
      const caps = registry.deriveCapabilities();
      expect(caps.resources).toEqual({ subscribe: true, listChanged: true });
    });

    it('should include resources when resource templates are registered', () => {
      registry.registerResourceTemplate({ name: 'T', uriTemplate: 'x://{id}' });
      const caps = registry.deriveCapabilities();
      expect(caps.resources).toEqual({ subscribe: true, listChanged: true });
    });

    it('should include prompts when prompts are registered', () => {
      registry.registerPrompt('a', {});
      const caps = registry.deriveCapabilities();
      expect(caps.prompts).toEqual({ listChanged: true });
    });

    it('should include completions when completion handler is set', () => {
      registry.setCompletionHandler(() => ({ completion: { values: [] } }));
      const caps = registry.deriveCapabilities();
      expect(caps.completions).toEqual({});
    });
  });

  // ── Reset ──────────────────────────────────────────────────────────

  describe('resetAll', () => {
    it('should clear all registrations', () => {
      registry.registerTool('a', {});
      registry.registerResource('b', { name: 'B' });
      registry.registerPrompt('c', {});
      registry.registerResourceTemplate({ name: 'T', uriTemplate: 'x://{id}' });
      registry.setCompletionHandler(() => ({ completion: { values: [] } }));

      registry.resetAll();

      expect(registry.tools.size).toBe(0);
      expect(registry.resources.size).toBe(0);
      expect(registry.prompts.size).toBe(0);
      expect(registry.listResourceTemplates()).toHaveLength(0);
      expect(registry.completionHandler).toBeUndefined();
    });
  });
});

// ── executeHandler ───────────────────────────────────────────────────

describe('executeHandler', () => {
  it('should return static response', async () => {
    const handler = {
      staticResponse: { content: [{ type: 'text' as const, text: 'hello' }] },
      callCount: 0,
      stateResponses: new Map(),
    };

    const result = await executeHandler<ToolResponse>(handler, [{}], makeExtra(), 0);
    expect(result).toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect(handler.callCount).toBe(1);
  });

  it('should call dynamic handler function', async () => {
    const handler = {
      handlerFn: (args: unknown) => ({
        content: [{ type: 'text' as const, text: `got: ${JSON.stringify(args)}` }],
      }),
      callCount: 0,
      stateResponses: new Map(),
    };

    const result = await executeHandler<ToolResponse>(handler, [{ q: 'test' }], makeExtra(), 0);
    expect(result.content[0]).toEqual({ type: 'text', text: 'got: {"q":"test"}' });
  });

  it('should throw error when error is set', async () => {
    const handler = {
      error: { code: -32603, message: 'fail' },
      callCount: 0,
      stateResponses: new Map(),
    };

    await expect(executeHandler(handler, [], makeExtra(), 0)).rejects.toEqual({
      code: -32603,
      message: 'fail',
    });
    expect(handler.callCount).toBe(1);
  });

  it('should throw when maxCalls exceeded', async () => {
    const handler = {
      staticResponse: { content: [{ type: 'text' as const, text: 'ok' }] },
      maxCalls: 2,
      callCount: 0,
      stateResponses: new Map(),
    };

    await executeHandler(handler, [], makeExtra(), 0);
    await executeHandler(handler, [], makeExtra(), 0);

    await expect(executeHandler(handler, [], makeExtra(), 0)).rejects.toMatchObject({
      code: -32603,
      message: 'Handler exhausted after 2 calls',
    });
  });

  it('should return state-dependent response when state matches', async () => {
    const stateResponses = new Map<string, ToolResponse>();
    stateResponses.set('active', { content: [{ type: 'text', text: 'active response' }] });

    const handler = {
      staticResponse: { content: [{ type: 'text' as const, text: 'default' }] },
      callCount: 0,
      stateResponses,
    };

    const result = await executeHandler<ToolResponse>(handler, [], makeExtra('active'), 0);
    expect(result.content[0]).toEqual({ type: 'text', text: 'active response' });
  });

  it('should fall back to static response when state does not match', async () => {
    const stateResponses = new Map<string, ToolResponse>();
    stateResponses.set('active', { content: [{ type: 'text', text: 'active response' }] });

    const handler = {
      staticResponse: { content: [{ type: 'text' as const, text: 'default' }] },
      callCount: 0,
      stateResponses,
    };

    const result = await executeHandler<ToolResponse>(handler, [], makeExtra('idle'), 0);
    expect(result.content[0]).toEqual({ type: 'text', text: 'default' });
  });

  it('should throw when no handler or response is configured', async () => {
    const handler = {
      callCount: 0,
      stateResponses: new Map(),
    };

    await expect(executeHandler(handler, [], makeExtra(), 0)).rejects.toMatchObject({
      code: -32603,
      message: 'No response configured for handler',
    });
  });

  it('should throw when only state responses exist but no match', async () => {
    const stateResponses = new Map<string, ToolResponse>();
    stateResponses.set('active', { content: [{ type: 'text', text: 'active' }] });

    const handler = {
      callCount: 0,
      stateResponses,
    };

    await expect(executeHandler(handler, [], makeExtra('idle'), 0)).rejects.toMatchObject({
      code: -32603,
      message: 'No handler for current state "idle"',
    });
  });

  it('should apply delay', async () => {
    const handler = {
      staticResponse: { content: [{ type: 'text' as const, text: 'ok' }] },
      delayMs: 50,
      callCount: 0,
      stateResponses: new Map(),
    };

    const start = Date.now();
    await executeHandler(handler, [], makeExtra(), 0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow small timing variance
  });

  it('should apply default delay when no per-handler delay', async () => {
    const handler = {
      staticResponse: { content: [{ type: 'text' as const, text: 'ok' }] },
      callCount: 0,
      stateResponses: new Map(),
    };

    const start = Date.now();
    await executeHandler(handler, [], makeExtra(), 50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('should apply jitter within range', async () => {
    const handler = {
      staticResponse: { content: [{ type: 'text' as const, text: 'ok' }] },
      jitter: [10, 50] as [number, number],
      callCount: 0,
      stateResponses: new Map(),
    };

    const start = Date.now();
    await executeHandler(handler, [], makeExtra(), 0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });
});
