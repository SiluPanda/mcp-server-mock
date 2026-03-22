# mcp-server-mock

Programmable mock MCP server for integration testing.

[![npm version](https://img.shields.io/npm/v/mcp-server-mock.svg)](https://www.npmjs.com/package/mcp-server-mock)
[![npm downloads](https://img.shields.io/npm/dt/mcp-server-mock.svg)](https://www.npmjs.com/package/mcp-server-mock)
[![license](https://img.shields.io/npm/l/mcp-server-mock.svg)](https://github.com/SiluPanda/mcp-server-mock/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/mcp-server-mock.svg)](https://nodejs.org)

## Description

`mcp-server-mock` is a fully controllable, in-process mock MCP (Model Context Protocol) server designed for testing MCP client code. It processes JSON-RPC requests and returns configured responses, enabling deterministic integration tests without running a real server.

The package provides a fluent builder API for registering tool, resource, and prompt handlers with canned responses, dynamic handler functions, error injections, configurable delays, and scenario state machines. Every request is recorded with timestamps and response details for post-hoc assertion.

Use this package when you need to test MCP client libraries, agent frameworks, MCP host applications, or any code that consumes MCP servers. It runs in-process, starts instantly, and produces identical results on every platform.

**Zero runtime dependencies.**

## Installation

```bash
npm install --save-dev mcp-server-mock
```

Requires Node.js >= 18.

## Quick Start

```typescript
import { MockMCPServer } from 'mcp-server-mock';

// Create a mock server
const server = new MockMCPServer({ name: 'test-server', version: '1.0.0' });

// Register a tool with a static response
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

// Complete the MCP initialization handshake
await server.handleRequest({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'my-client', version: '1.0.0' } },
});
server.handleNotification({ jsonrpc: '2.0', method: 'notifications/initialized' });

// Call the tool
const response = await server.handleRequest({
  jsonrpc: '2.0', id: 2, method: 'tools/call',
  params: { name: 'search', arguments: { query: 'TypeScript' } },
});

// Assert interactions
server.assertToolCalled('search', 1);
server.assertToolCalledWith('search', { query: 'TypeScript' });
```

## Features

- **Fluent builder API** -- Register tools, resources, and prompts with chainable configuration methods.
- **Request recording** -- Every request is captured with sequence number, ISO 8601 timestamp, parameters, response result or error, and duration in milliseconds.
- **Assertion helpers** -- Built-in methods for verifying tool calls, resource reads, prompt retrievals, method invocations, and total request counts. All assertions throw descriptive errors on failure.
- **Scenario state machines** -- Define named states and transitions triggered by specific requests. Tools, resources, and prompts return different responses depending on the current state.
- **Error simulation** -- Pre-built factories for all standard JSON-RPC errors plus custom application errors. Inject errors per-handler or globally.
- **Delay and jitter injection** -- Simulate slow servers with fixed delays, random jitter ranges, or infinite timeouts.
- **Handler exhaustion** -- Limit a handler to N invocations, then return an exhaustion error.
- **Fixture loading** -- Configure the entire mock server declaratively from a JSON fixture object.
- **Response interceptors** -- Intercept and modify responses for any method before they are returned. Useful for simulating malformed or injected fields.
- **Dynamic handler modification** -- Add or remove tools, resources, and prompts at any point during a test.
- **Automatic capability derivation** -- The server's `initialize` response reflects exactly which handlers are registered, matching real MCP server behavior.
- **Full MCP protocol lifecycle** -- Enforces the `initialize` / `notifications/initialized` handshake. Handles `ping`, `logging/setLevel`, `resources/subscribe`, `resources/unsubscribe`, `completion/complete`, and all standard MCP methods.
- **Zero runtime dependencies** -- Only dev dependencies for building and testing.

## API Reference

### `MockMCPServer`

The main class. Create an instance, register handlers, process requests, and run assertions.

```typescript
import { MockMCPServer } from 'mcp-server-mock';

const server = new MockMCPServer(options);
```

#### Constructor Options (`MockServerOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | *required* | Server name reported in `initialize` response. |
| `version` | `string` | *required* | Server version reported in `initialize` response. |
| `protocolVersion` | `string` | `'2025-03-26'` | MCP protocol version to advertise. |
| `capabilities` | `Partial<ServerCapabilities>` | *auto-derived* | Override automatic capability derivation. |
| `defaultDelayMs` | `number` | `0` | Global delay applied to all responses unless overridden per-handler. |
| `recordNotifications` | `boolean` | `true` | Whether to record client notifications. |
| `enforceInitialization` | `boolean` | `true` | Require the `initialize` / `notifications/initialized` handshake before accepting requests. |

#### Handler Registration

```typescript
// Tools
server.tool(name: string, definition?: ToolDefinition): ToolBuilder

// Resources
server.resource(uri: string, definition?: ResourceDefinition): ResourceBuilder

// Resource templates
server.resourceTemplate(definition: ResourceTemplateDefinition): void

// Prompts
server.prompt(name: string, definition?: PromptDefinition): PromptBuilder

// Completions
server.completion(handler: CompletionHandlerFn): void
```

#### Request Processing

```typescript
// Process a JSON-RPC request (returns a JSON-RPC response)
await server.handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>

// Process a JSON-RPC notification (no response)
server.handleNotification(notification: JsonRpcNotification): void
```

#### Request Recording

```typescript
server.requests                        // All recorded requests
server.notifications                   // All recorded notifications
server.requestsFor(method: string)     // Requests filtered by method
server.toolCalls(toolName: string)     // Tool call requests filtered by tool name
server.resourceReads(uri: string)      // Resource read requests filtered by URI
server.promptGets(promptName: string)  // Prompt get requests filtered by prompt name
```

#### Assertions

All assertion methods throw descriptive `Error` messages when expectations are not met.

```typescript
server.assertToolCalled(toolName: string, times?: number): void
server.assertToolCalledWith(toolName: string, args: Record<string, unknown>): void
server.assertToolNotCalled(toolName: string): void
server.assertResourceRead(uri: string, times?: number): void
server.assertPromptRetrieved(promptName: string, times?: number): void
server.assertMethodCalled(method: string, times?: number): void
server.assertNoRequests(): void
server.assertRequestCount(count: number): void
```

#### Scenario State Machine

```typescript
server.scenario(definition: ScenarioDefinition): void
server.currentState: string | undefined   // Current scenario state (readonly)
server.setState(stateName: string): void  // Manually set state
```

#### Dynamic Modification

```typescript
server.removeTool(name: string): void
server.removeResource(uri: string): void
server.removePrompt(name: string): void
server.interceptResponse(method: string, fn: (response) => response): void
```

#### Lifecycle

```typescript
server.resetRecordings(): void   // Clear recorded requests and notifications
server.resetAll(): void          // Reset handlers, recordings, scenario, and initialization state
server.loadFixture(fixture: FixtureFile): void  // Configure server from a fixture object
await server.close(): Promise<void>             // Close the mock server
```

### `createMockServer`

Factory function equivalent to `new MockMCPServer(options)`.

```typescript
import { createMockServer } from 'mcp-server-mock';

const server = createMockServer({ name: 'test', version: '1.0.0' });
```

### `ToolBuilder`

Returned by `server.tool()`. All methods return `this` for fluent chaining.

| Method | Description |
|--------|-------------|
| `.returns(response: ToolResponse)` | Set a static response. |
| `.handlerFn(fn: ToolHandlerFn)` | Set a dynamic handler function that receives `(args, extra)`. |
| `.throws(error: MockError)` | Make this tool return a JSON-RPC error. |
| `.withDelay(ms: number)` | Add a fixed delay before responding. |
| `.withJitter(minMs: number, maxMs: number)` | Add random delay in the given range. |
| `.timesOut()` | Never respond (simulate timeout). |
| `.times(n: number)` | Respond only `n` times, then return an exhaustion error. |
| `.inState(stateName: string, response: ToolResponse)` | Return a different response when the scenario is in the given state. |

### `ResourceBuilder`

Returned by `server.resource()`. All methods return `this` for fluent chaining.

| Method | Description |
|--------|-------------|
| `.returns(response: ResourceResponse)` | Set static content. |
| `.handlerFn(fn: ResourceHandlerFn)` | Set a dynamic handler function that receives `(uri, extra)`. |
| `.throws(error: MockError)` | Make this resource return a JSON-RPC error. |
| `.withDelay(ms: number)` | Add a fixed delay before responding. |
| `.timesOut()` | Never respond (simulate timeout). |
| `.inState(stateName: string, response: ResourceResponse)` | Return different content when the scenario is in the given state. |

### `PromptBuilder`

Returned by `server.prompt()`. All methods return `this` for fluent chaining.

| Method | Description |
|--------|-------------|
| `.returns(response: PromptResponse)` | Set a static response. |
| `.handlerFn(fn: PromptHandlerFn)` | Set a dynamic handler function that receives `(args, extra)`. |
| `.throws(error: MockError)` | Make this prompt return a JSON-RPC error. |
| `.withDelay(ms: number)` | Add a fixed delay before responding. |
| `.inState(stateName: string, response: PromptResponse)` | Return a different response when the scenario is in the given state. |

### `MockErrors`

Pre-built error factories for common JSON-RPC errors.

```typescript
import { MockErrors } from 'mcp-server-mock';

MockErrors.methodNotFound(method?: string)          // -32601
MockErrors.invalidParams(message?: string)           // -32602
MockErrors.internalError(message?: string)           // -32603
MockErrors.parseError()                              // -32700
MockErrors.invalidRequest(message?: string)          // -32600
MockErrors.custom(code: number, message: string, data?: unknown)  // Any code
```

### `RequestRecorder`

Captures all incoming requests and notifications. Accessed via `server.requests` and `server.notifications`, or used standalone.

```typescript
import { RequestRecorder } from 'mcp-server-mock';

const recorder = new RequestRecorder();
recorder.recordRequest(method, params, id, result, error, durationMs);
recorder.recordNotification(method, params, direction);

recorder.requests          // ReadonlyArray<RecordedRequest>
recorder.notifications     // ReadonlyArray<RecordedNotification>
recorder.requestsFor(method)
recorder.toolCalls(toolName)
recorder.resourceReads(uri)
recorder.promptGets(promptName)
recorder.lastRequests(n)
recorder.requestCount      // number
recorder.reset()
```

### `HandlerRegistry`

Internal registry for tools, resources, prompts, resource templates, and completion handlers. Handles capability derivation.

```typescript
import { HandlerRegistry } from 'mcp-server-mock';

const registry = new HandlerRegistry();
registry.registerTool(name, definition);
registry.registerResource(uri, definition);
registry.registerResourceTemplate(definition);
registry.registerPrompt(name, definition);
registry.setCompletionHandler(handler);

registry.getTool(name)
registry.getResource(uri)
registry.getPrompt(name)
registry.removeTool(name)
registry.removeResource(uri)
registry.removePrompt(name)

registry.listTools()
registry.listResources()
registry.listResourceTemplates()
registry.listPrompts()
registry.deriveCapabilities()
registry.resetAll()
```

### `ScenarioManager`

Manages scenario state machine for multi-step interaction testing.

```typescript
import { ScenarioManager } from 'mcp-server-mock';

const manager = new ScenarioManager();
manager.configure({ initialState: 'idle', transitions: [...] });
manager.currentState       // string | undefined
manager.isConfigured       // boolean
manager.setState('active');
manager.processRequest(method, params);  // Returns new state
manager.reset();           // Reset to initial state
manager.clear();           // Remove configuration entirely
```

### `AssertionHelper`

Assertion helpers for verifying mock server interactions. All methods throw descriptive errors when expectations are not met.

```typescript
import { AssertionHelper } from 'mcp-server-mock';

const helper = new AssertionHelper(recorder);
helper.assertToolCalled(toolName, times?);
helper.assertToolCalledWith(toolName, args);
helper.assertToolNotCalled(toolName);
helper.assertResourceRead(uri, times?);
helper.assertPromptRetrieved(promptName, times?);
helper.assertMethodCalled(method, times?);
helper.assertNoRequests();
helper.assertRequestCount(count);
```

## Configuration

### Server Capabilities

By default, capabilities are automatically derived from registered handlers:

- `tools` capability is declared when any tool is registered.
- `resources` capability (with `subscribe: true` and `listChanged: true`) is declared when any resource or resource template is registered.
- `prompts` capability is declared when any prompt is registered.
- `logging` capability is always declared.
- `completions` capability is declared when a completion handler is set.

Override automatic derivation by passing `capabilities` in the constructor options:

```typescript
const server = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  capabilities: {
    tools: { listChanged: false },
    resources: undefined,  // Explicitly disable
  },
});
```

### Global Delay

Apply a default delay to all handlers:

```typescript
const server = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  defaultDelayMs: 100,
});
```

Per-handler delays (via `.withDelay()` or `.withJitter()`) take precedence over the global default.

### Initialization Enforcement

By default, the server rejects all requests before the `initialize` / `notifications/initialized` handshake completes. Disable this for simpler test setups:

```typescript
const server = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  enforceInitialization: false,
});
```

## Error Handling

### JSON-RPC Error Injection

Inject errors on specific handlers using the `MockErrors` factory:

```typescript
import { MockErrors } from 'mcp-server-mock';

// Standard JSON-RPC errors
server.tool('broken').throws(MockErrors.internalError('Database crashed'));
server.tool('missing').throws(MockErrors.methodNotFound('search'));
server.tool('bad_input').throws(MockErrors.invalidParams('Missing required field'));

// Custom application errors with data payload
server.tool('rate_limited').throws(
  MockErrors.custom(-32000, 'Rate limited', { retryAfter: 60 })
);
```

### Handler Exhaustion

Limit a handler to a fixed number of invocations:

```typescript
server.tool('limited')
  .returns({ content: [{ type: 'text', text: 'ok' }] })
  .times(3);

// First 3 calls succeed; the 4th returns:
// { code: -32603, message: "Handler exhausted after 3 calls" }
```

### Timeout Simulation

Simulate a handler that never responds:

```typescript
server.tool('black_hole').timesOut();
// The returned promise never resolves
```

### Unhandled Errors

If a dynamic handler function throws a regular `Error`, it is caught and wrapped as a JSON-RPC internal error (`-32603`). If it throws an object matching the `MockError` shape (`{ code: number, message: string }`), that error is returned directly.

### Initialization Errors

When `enforceInitialization` is `true` (the default), any request sent before the handshake completes receives a `-32600` (Invalid Request) error with the message "Server not initialized".

## Advanced Usage

### Dynamic Handler Functions

Use handler functions for computed responses:

```typescript
server.tool('add', {
  inputSchema: {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
  },
}).handlerFn((args) => ({
  content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }],
}));
```

The handler function receives `(args: Record<string, unknown>, extra: RequestExtra)`. The `extra` object provides:

- `extra.state` -- The current scenario state (`string | undefined`).
- `extra.server` -- A reference to the `MockMCPServer` instance for calling `setState()` or `resetRecordings()` from within a handler.

### Scenario State Machines

Define states and transitions for multi-step interaction testing:

```typescript
server.scenario({
  initialState: 'unauthenticated',
  transitions: [
    { from: 'unauthenticated', method: 'tools/call', match: { name: 'login' }, to: 'authenticated' },
    { from: 'authenticated', method: 'tools/call', match: { name: 'logout' }, to: 'unauthenticated' },
  ],
});

server.tool('get_data')
  .inState('unauthenticated', {
    content: [{ type: 'text', text: 'Access denied' }],
    isError: true,
  })
  .inState('authenticated', {
    content: [{ type: 'text', text: '{"users": 42}' }],
  });
```

Transitions support three matching modes:

- **No match** -- Any request with the specified method triggers the transition.
- **Object match** -- Shallow partial match on request params. All key-value pairs in the match object must be present in the params.
- **Function match** -- A predicate function `(params) => boolean` for complex matching logic.

```typescript
// Function matcher example
{
  from: 'start',
  method: 'tools/call',
  match: (params) => params.name === 'step1' && params.arguments?.mode === 'fast',
  to: 'running',
}
```

State transitions happen after the handler executes, so the handler sees the state at the time of the request.

### Fixture Loading

Configure the entire mock server declaratively:

```typescript
server.loadFixture({
  server: { name: 'test', version: '1.0.0', defaultDelayMs: 10 },
  tools: [
    {
      name: 'search',
      description: 'Search tool',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      response: { content: [{ type: 'text', text: 'result' }] },
    },
    {
      name: 'fail',
      error: { code: -32603, message: 'broken' },
    },
    {
      name: 'stateful',
      states: {
        idle: { content: [{ type: 'text', text: 'idle data' }] },
        active: { content: [{ type: 'text', text: 'active data' }] },
      },
    },
  ],
  resources: [
    {
      uri: 'file:///config.json',
      name: 'Config',
      mimeType: 'application/json',
      response: { contents: [{ uri: 'file:///config.json', text: '{"debug": true}' }] },
    },
  ],
  resourceTemplates: [
    { name: 'User', uriTemplate: 'db://users/{id}', description: 'User by ID' },
  ],
  prompts: [
    {
      name: 'review',
      description: 'Code review',
      arguments: [{ name: 'language', required: true }],
      response: {
        messages: [{ role: 'user', content: { type: 'text', text: 'Review this code.' } }],
      },
    },
  ],
  scenario: {
    initialState: 'idle',
    transitions: [
      { from: 'idle', method: 'tools/call', match: { name: 'stateful' }, to: 'active' },
    ],
  },
});
```

### Response Interceptors

Intercept and modify responses for any method. Useful for testing how clients handle malformed or unexpected response fields:

```typescript
server.interceptResponse('tools/call', (response) => {
  const result = response.result as Record<string, unknown>;
  result.extraField = 'injected';
  return response;
});
```

### Completion Handlers

Register a handler for `completion/complete` requests:

```typescript
server.completion((ref, argument) => ({
  completion: {
    values: ['typescript', 'terraform'].filter(v => v.startsWith(argument.value)),
    hasMore: false,
  },
}));
```

### Test Lifecycle Patterns

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import { MockMCPServer } from 'mcp-server-mock';

describe('my MCP client', () => {
  let server: MockMCPServer;

  beforeEach(async () => {
    server = new MockMCPServer({ name: 'test', version: '1.0.0' });

    // Complete initialization handshake
    await server.handleRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'client', version: '1.0.0' } },
    });
    server.handleNotification({ jsonrpc: '2.0', method: 'notifications/initialized' });

    // Register handlers for this test suite
    server.tool('search').returns({
      content: [{ type: 'text', text: 'result' }],
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('should call the search tool', async () => {
    // ... exercise your client code ...

    server.assertToolCalled('search', 1);
    server.assertToolCalledWith('search', { query: 'test' });
  });

  it('should handle errors', async () => {
    server.resetRecordings();
    // ... different test ...
  });
});
```

### Supported MCP Methods

The mock server handles all standard MCP request methods:

| Method | Description |
|--------|-------------|
| `initialize` | Protocol handshake. Returns server info and capabilities. |
| `ping` | Liveness check. Returns empty result. |
| `tools/list` | Returns all registered tools with schemas. |
| `tools/call` | Executes a tool handler by name. |
| `resources/list` | Returns all registered resources. |
| `resources/read` | Reads a resource by URI. |
| `resources/templates/list` | Returns all registered resource templates. |
| `resources/subscribe` | Accepts subscription (returns empty result). |
| `resources/unsubscribe` | Accepts unsubscription (returns empty result). |
| `prompts/list` | Returns all registered prompts. |
| `prompts/get` | Retrieves a prompt by name. |
| `completion/complete` | Delegates to the registered completion handler. |
| `logging/setLevel` | Accepts log level changes. |

Unknown methods return a `-32601` (Method Not Found) error.

## TypeScript

`mcp-server-mock` is written in TypeScript and ships type declarations alongside the compiled JavaScript. All public types are exported from the package entry point.

### Exported Types

```typescript
import type {
  MockServerOptions,
  ServerCapabilities,
  ToolDefinition,
  ToolAnnotations,
  ToolContent,
  ToolResponse,
  ToolHandlerFn,
  ResourceDefinition,
  ResourceContent,
  ResourceResponse,
  ResourceHandlerFn,
  ResourceTemplateDefinition,
  PromptDefinition,
  PromptArgument,
  PromptMessage,
  PromptResponse,
  PromptHandlerFn,
  CompletionResponse,
  CompletionHandlerFn,
  MockError,
  RecordedRequest,
  RecordedNotification,
  RequestExtra,
  ScenarioDefinition,
  ScenarioTransition,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcMessage,
  FixtureFile,
  FixtureTool,
  FixtureResource,
  FixtureResourceTemplate,
  FixturePrompt,
  RegisteredHandler,
  MockMCPServerInterface,
} from 'mcp-server-mock';
```

### Exported Classes and Functions

```typescript
import {
  MockMCPServer,
  createMockServer,
  MockErrors,
  ToolBuilder,
  ResourceBuilder,
  PromptBuilder,
  RequestRecorder,
  HandlerRegistry,
  ScenarioManager,
  AssertionHelper,
} from 'mcp-server-mock';
```

### Compiler Target

The package compiles to ES2022 with CommonJS module output. Declaration files and source maps are included.

## License

MIT
