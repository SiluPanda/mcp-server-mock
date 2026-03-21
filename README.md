# mcp-server-mock

Programmable mock MCP (Model Context Protocol) server for integration testing. Provides a fully controllable, in-process mock that responds to MCP-style JSON-RPC requests with canned responses, simulated errors, configurable delays, and protocol edge cases.

## Features

- **Fluent builder API** for registering tool, resource, and prompt handlers
- **Request recording** with timestamps and response details for post-hoc assertion
- **Assertion helpers** for verifying tool calls, resource reads, and prompt retrievals
- **Scenario state machines** for testing multi-step stateful interactions
- **Error simulation** with pre-built factories for all standard JSON-RPC errors
- **Delay and jitter injection** for testing timeout handling
- **Fixture loading** from JSON for declarative mock configuration
- **Response interceptors** for simulating malformed responses
- **Zero runtime dependencies**

## Installation

```bash
npm install --save-dev mcp-server-mock
```

## Quick Start

```typescript
import { MockMCPServer } from 'mcp-server-mock';

const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

// Register a tool with a static response
mock.tool('search', {
  description: 'Search the web',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
}).returns({
  content: [{ type: 'text', text: 'TypeScript is great' }],
});

// Process requests (JSON-RPC style)
const initResp = await mock.handleRequest({
  jsonrpc: '2.0', id: 1, method: 'initialize', params: {}
});
mock.handleNotification({
  jsonrpc: '2.0', method: 'notifications/initialized'
});

const result = await mock.handleRequest({
  jsonrpc: '2.0', id: 2, method: 'tools/call',
  params: { name: 'search', arguments: { query: 'TypeScript' } }
});

// Assertions
mock.assertToolCalled('search', 1);
mock.assertToolCalledWith('search', { query: 'TypeScript' });
```

## Dynamic Handlers

```typescript
mock.tool('add', {
  inputSchema: {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
  },
}).handlerFn((args) => ({
  content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }],
}));
```

## Error Simulation

```typescript
import { MockErrors } from 'mcp-server-mock';

mock.tool('fail').throws(MockErrors.internalError('Database crashed'));
mock.tool('limited').returns({ content: [{ type: 'text', text: 'ok' }] }).times(2);
mock.tool('custom').throws(MockErrors.custom(-32000, 'Rate limited', { retryAfter: 60 }));
```

## Delay and Timeout

```typescript
mock.tool('slow').returns({ content: [{ type: 'text', text: 'done' }] }).withDelay(500);
mock.tool('jittery').returns({ content: [{ type: 'text', text: 'ok' }] }).withJitter(100, 2000);
mock.tool('black_hole').timesOut(); // never responds
```

## Resources

```typescript
mock.resource('file:///config.json', {
  name: 'Config',
  mimeType: 'application/json',
}).returns({
  contents: [{ uri: 'file:///config.json', text: '{"debug": true}' }],
});
```

## Prompts

```typescript
mock.prompt('review', {
  description: 'Code review',
  arguments: [{ name: 'language', required: true }],
}).returns({
  messages: [{ role: 'user', content: { type: 'text', text: 'Review this code.' } }],
});
```

## Scenario State Machines

```typescript
mock.scenario({
  initialState: 'unauthenticated',
  transitions: [
    { from: 'unauthenticated', method: 'tools/call', match: { name: 'login' }, to: 'authenticated' },
    { from: 'authenticated', method: 'tools/call', match: { name: 'logout' }, to: 'unauthenticated' },
  ],
});

mock.tool('get_data')
  .inState('unauthenticated', { content: [{ type: 'text', text: 'Access denied' }], isError: true })
  .inState('authenticated', { content: [{ type: 'text', text: '{"data": [1,2,3]}' }] });
```

## Fixture Loading

```typescript
mock.loadFixture({
  server: { name: 'test', version: '1.0.0' },
  tools: [{
    name: 'search',
    description: 'Search tool',
    response: { content: [{ type: 'text', text: 'result' }] },
  }],
  resources: [{
    uri: 'file:///config',
    name: 'Config',
    response: { contents: [{ uri: 'file:///config', text: '{}' }] },
  }],
});
```

## Assertions

```typescript
mock.assertToolCalled('search');           // called at least once
mock.assertToolCalled('search', 3);        // called exactly 3 times
mock.assertToolNotCalled('delete');        // never called
mock.assertToolCalledWith('search', { query: 'test' });
mock.assertResourceRead('file:///config');
mock.assertPromptRetrieved('review');
mock.assertMethodCalled('initialize', 1);
mock.assertNoRequests();
mock.assertRequestCount(5);
```

## Request Recording

```typescript
const allRequests = mock.requests;
const toolCalls = mock.toolCalls('search');
const resourceReads = mock.resourceReads('file:///config');
const promptGets = mock.promptGets('review');
const byMethod = mock.requestsFor('tools/call');

// Reset between tests
mock.resetRecordings();
mock.resetAll(); // also clears handlers and scenario state
```

## API

### `MockMCPServer`

| Method | Description |
|--------|-------------|
| `tool(name, definition?)` | Register a tool, returns `ToolBuilder` |
| `resource(uri, definition?)` | Register a resource, returns `ResourceBuilder` |
| `resourceTemplate(definition)` | Register a resource template |
| `prompt(name, definition?)` | Register a prompt, returns `PromptBuilder` |
| `completion(handler)` | Register a completion handler |
| `handleRequest(request)` | Process a JSON-RPC request |
| `handleNotification(notification)` | Process a JSON-RPC notification |
| `scenario(definition)` | Configure scenario state machine |
| `setState(name)` | Manually set scenario state |
| `loadFixture(fixture)` | Load fixture configuration |
| `interceptResponse(method, fn)` | Intercept and modify responses |
| `removeTool(name)` | Remove a registered tool |
| `removeResource(uri)` | Remove a registered resource |
| `removePrompt(name)` | Remove a registered prompt |
| `resetRecordings()` | Clear recorded requests/notifications |
| `resetAll()` | Reset everything |
| `close()` | Close the server |

### Builder Methods

All builders support fluent chaining:

- `.returns(response)` - static response
- `.handlerFn(fn)` - dynamic handler
- `.throws(error)` - error injection
- `.withDelay(ms)` - fixed delay
- `.withJitter(min, max)` - random delay (ToolBuilder only)
- `.timesOut()` - never respond
- `.times(n)` - respond N times then exhaust (ToolBuilder only)
- `.inState(name, response)` - state-dependent response

## License

MIT
