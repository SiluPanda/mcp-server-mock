# mcp-server-mock -- Specification

## 1. Overview

`mcp-server-mock` is a programmable mock MCP (Model Context Protocol) server for integration testing. It provides a fully controllable, in-process MCP server that responds to client requests with canned responses, simulated errors, configurable delays, and protocol edge cases. Developers register handlers for tools, resources, and prompts using a fluent builder API, and the mock server serves those responses to any MCP client connected over any supported transport (in-memory, stdio, or Streamable HTTP). Request recording, assertion helpers, scenario state machines, and fixture file loading enable comprehensive testing of MCP client code without running a real server.

The gap this package fills is specific and well-validated. The MCP ecosystem has testing tools that test MCP _servers_ -- the MCP Inspector (`@modelcontextprotocol/inspector`) provides interactive debugging, `@mcp-testing/server-tester` provides Playwright-based server test fixtures, and `mcp-test-client` provides a lightweight client for exercising server handlers. Nothing in the ecosystem provides a mock _server_ for testing MCP _clients_. When developers build an agent framework that calls `tools/call`, a Claude Desktop extension that reads resources, or a custom MCP host that orchestrates multiple servers, they need a predictable, programmable server to connect to during tests. Today they must either spin up a real server subprocess (slow, flaky, requires the actual server to exist), hand-roll JSON-RPC responses over stdio (brittle, error-prone, does not test the real protocol lifecycle), or skip client-side testing entirely (common and dangerous). `mcp-server-mock` addresses all three problems with a purpose-built mock that speaks the full MCP protocol, runs in-process for unit tests or as a standalone process for integration tests, and provides a testing-focused API designed for assertion and verification.

`mcp-server-mock` is not a general-purpose MCP server framework. It is a test double -- a fake server whose sole purpose is to make MCP client code testable. It provides canned response registration (return specific content for specific tool calls), error simulation (return JSON-RPC errors, transport failures, or malformed responses on demand), delay injection (simulate slow servers, timeouts, and jitter), request recording (capture every request received for post-hoc assertion), scenario state machines (change responses based on previous interactions), fixture file loading (define entire mock configurations as JSON files), and recording mode (proxy to a real server, capture interactions, and replay them later). The API is designed to work naturally with Jest, Vitest, and Mocha, providing `beforeEach`/`afterEach` lifecycle helpers, assertion methods, and test framework integration.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `MockMCPServer` class that implements the full MCP protocol lifecycle (`initialize` / `initialized`, capability enumeration, tool calls, resource reads, prompt retrieval, subscriptions, completions, logging, and ping) with programmable responses for every operation.
- Support three transport modes: **in-memory** (using the SDK's `InMemoryTransport` for zero-overhead unit tests), **stdio** (spawning the mock as a child process for integration tests that need real transport), and **Streamable HTTP** (running an HTTP server for tests that exercise HTTP-level behavior).
- Provide a fluent builder API for registering tool, resource, and prompt handlers with canned responses, dynamic response functions, error injections, and delays.
- Record every request received by the mock server, including method, params, timestamps, and client info, for post-hoc assertion and verification.
- Provide assertion helpers compatible with Jest/Vitest (`expect`-style) and standalone (boolean return) for verifying that specific tools were called, resources were read, prompts were retrieved, and that call arguments matched expected patterns.
- Support scenario-based testing with state machines: define named states, transitions triggered by specific requests, and state-dependent responses. This enables testing multi-step client workflows (e.g., "after the client calls `initialize_session`, the `get_data` tool returns different results").
- Support fixture file loading from JSON files that declaratively define the mock server's tools, resources, prompts, and their responses.
- Support recording mode: proxy requests to a real MCP server, capture all request/response pairs, and serialize them as fixtures for later replay. This mirrors nock's recording functionality.
- Provide a CLI (`mcp-server-mock`) for running a standalone mock server from fixture files, useful for manual testing, demos, and integration tests that spawn the server as a subprocess.
- Support simulation of all MCP protocol edge cases: capability negotiation failures, version mismatches, unexpected notifications, out-of-order responses, duplicate request IDs, partial content streams, and server-initiated messages.
- Keep runtime dependencies minimal: depend only on `@modelcontextprotocol/sdk` for protocol types and transport implementations.

### Non-Goals

- **Not a production MCP server framework.** This package creates fake servers for testing. Building real MCP servers with actual business logic belongs to `@modelcontextprotocol/sdk`'s `Server` and `McpServer` classes.
- **Not a server testing tool.** This package tests MCP _clients_, not servers. Tools that test server handler implementations (like `@mcp-testing/server-tester` or `mcp-test-client`) solve a different problem.
- **Not a protocol conformance validator.** This package does not verify that a client's requests conform to the MCP specification. Use `mcp-schema-lint` for schema validation and the MCP Inspector for protocol debugging.
- **Not a load testing tool.** This package handles one client connection at a time for deterministic test behavior. It does not simulate concurrent clients, measure throughput, or stress-test protocol implementations.
- **Not a mock HTTP server.** This package mocks the MCP protocol layer, not raw HTTP. For HTTP-level mocking (headers, status codes, TLS), use `nock` or `msw`. The Streamable HTTP transport mode runs a real HTTP server that speaks MCP; it does not intercept HTTP requests.
- **Not an AI agent framework.** This package does not make tool call decisions, orchestrate workflows, or interact with LLMs. It provides a fake server for testing code that does those things.

---

## 3. Target Users and Use Cases

### MCP Client Library Developers

Developers building or maintaining MCP client libraries (wrappers around `@modelcontextprotocol/sdk`'s `Client` class) need to verify that their client correctly handles initialization, tool enumeration, tool invocation, resource reading, prompt retrieval, pagination, error responses, timeouts, and connection lifecycle. A mock server provides deterministic, repeatable responses for each of these operations without requiring a real server.

### Agent Framework Authors

Teams building agent frameworks (like LangChain MCP integrations, AutoGen tool providers, or custom agentic systems) that consume MCP servers need to test tool discovery, tool selection, argument marshaling, response parsing, error handling, retry logic, and multi-server orchestration. A mock server lets them test each of these behaviors in isolation with controlled inputs and outputs.

### MCP Host Application Developers

Developers building MCP host applications (like Claude Desktop plugins, Cursor extensions, or custom AI interfaces) that connect to multiple MCP servers need to test server connection management, capability negotiation, graceful degradation when a server is unavailable, and correct routing of tool calls to the right server. Mock servers with different capability profiles enable comprehensive host testing.

### CI/CD Pipeline Testing

Teams running MCP client integration tests in CI pipelines need fast, reliable, deterministic tests that do not depend on external services or real server processes. In-memory mock servers start instantly, never flake, and run identically on every platform.

### Demo and Prototyping

Developers prototyping MCP client UIs or agent workflows need a server that returns realistic-looking responses without building real tool implementations. Fixture files loaded into a mock server provide this capability with zero code.

---

## 4. Core Concepts

### MCP Protocol Lifecycle

Every MCP session follows a three-phase lifecycle that the mock server faithfully implements:

1. **Initialization**: The client sends an `initialize` request containing `protocolVersion`, `capabilities`, and `clientInfo`. The mock server responds with its own `protocolVersion`, `capabilities` (derived from registered handlers), and `serverInfo`. The client then sends a `notifications/initialized` notification to complete the handshake. The mock server tracks this lifecycle and rejects pre-handshake requests with appropriate errors.

2. **Operation**: The client sends requests (`tools/list`, `tools/call`, `resources/list`, `resources/read`, `resources/subscribe`, `resources/unsubscribe`, `prompts/list`, `prompts/get`, `completion/complete`, `logging/setLevel`, `ping`) and receives responses. The mock server dispatches each request to the registered handler, records the request, applies any configured delays or error injections, and returns the handler's response.

3. **Shutdown**: The client closes the transport connection. For in-memory transports, this means calling `close()` on the transport. For stdio, this means closing stdin. For HTTP, this means sending an HTTP DELETE to terminate the session. The mock server cleans up internal state and finalizes request recordings.

### MCP Server Capabilities

During initialization, the mock server declares capabilities based on what handlers are registered:

- **`tools`**: Declared if any tool handlers are registered. Includes `listChanged: true` if notification simulation is enabled.
- **`resources`**: Declared if any resource handlers are registered. Includes `subscribe: true` if subscription handlers are registered, and `listChanged: true` if notification simulation is enabled.
- **`prompts`**: Declared if any prompt handlers are registered. Includes `listChanged: true` if notification simulation is enabled.
- **`logging`**: Declared if logging level tracking is enabled (enabled by default).
- **`completions`**: Declared if any completion handlers are registered.

This automatic capability derivation means the mock server's `initialize` response accurately reflects what operations it supports, matching the behavior of a real MCP server.

### MCP Methods

The mock server handles all standard MCP request methods:

| Method | Direction | Purpose |
|--------|-----------|---------|
| `initialize` | Client -> Server | Protocol handshake. Exchange versions, capabilities, identity. |
| `ping` | Client -> Server | Liveness check. Returns empty result. |
| `tools/list` | Client -> Server | Enumerate available tools with schemas. |
| `tools/call` | Client -> Server | Execute a tool with arguments. |
| `resources/list` | Client -> Server | Enumerate available resources. |
| `resources/read` | Client -> Server | Read resource content by URI. |
| `resources/subscribe` | Client -> Server | Subscribe to resource change notifications. |
| `resources/unsubscribe` | Client -> Server | Unsubscribe from resource change notifications. |
| `resources/templates/list` | Client -> Server | Enumerate resource templates. |
| `prompts/list` | Client -> Server | Enumerate available prompts. |
| `prompts/get` | Client -> Server | Retrieve a prompt with arguments. |
| `completion/complete` | Client -> Server | Request argument auto-completion. |
| `logging/setLevel` | Client -> Server | Set the server's logging verbosity. |

### MCP Notifications

The mock server can emit server-to-client notifications:

| Notification | Purpose |
|-------------|---------|
| `notifications/tools/list_changed` | Signal that the tool list has changed. |
| `notifications/resources/list_changed` | Signal that the resource list has changed. |
| `notifications/resources/updated` | Signal that a specific resource's content has changed. |
| `notifications/prompts/list_changed` | Signal that the prompt list has changed. |
| `notifications/progress` | Report progress on a long-running request. |
| `notifications/cancelled` | Acknowledge a client's cancellation request. |
| `notifications/message` | Send a log message to the client. |

The mock server also receives client-to-server notifications:

| Notification | Purpose |
|-------------|---------|
| `notifications/initialized` | Client confirms initialization is complete. |
| `notifications/cancelled` | Client cancels an in-progress request. |
| `notifications/roots/list_changed` | Client's root list has changed. |

### Test Double Patterns

`mcp-server-mock` implements several test double patterns from the testing literature:

- **Stub**: Return a fixed response for a specific request. The simplest use case -- register a tool and its canned response.
- **Fake**: Implement simplified logic. A tool handler function that computes a response based on arguments, without calling real services.
- **Spy**: Record all requests for later assertion. Every request is recorded with full details, enabling post-hoc verification.
- **Mock (in the strict sense)**: Pre-programmed expectations. The assertion API lets tests declare "tool X must be called exactly 3 times with arguments matching pattern Y" and fail if the expectation is not met.
- **Scenario**: State-dependent behavior. State machines change responses based on prior interactions, enabling multi-step workflow testing.

### Transports

The mock server supports three transport modes:

- **In-Memory (`InMemoryTransport`)**: Uses the MCP SDK's `InMemoryTransport.createLinkedPair()` to create a pair of connected transports. One transport is given to the mock server, the other to the client under test. No I/O, no subprocess, no network -- pure in-process message passing. This is the preferred transport for unit tests.

- **stdio**: The mock server runs as a subprocess. The test spawns the mock server process with a fixture file or inline configuration, and connects an MCP client to it via `StdioClientTransport`. This tests the real stdio transport path, including JSON-RPC framing over stdin/stdout, subprocess lifecycle, and signal handling.

- **Streamable HTTP**: The mock server runs an HTTP server on a local port. The test connects an MCP client via `StreamableHTTPClientTransport`. This tests the real HTTP transport path, including HTTP request/response, session management via `Mcp-Session-Id` headers, and SSE streaming.

### Fixture Files

Fixture files are JSON documents that declaratively define the mock server's entire configuration: what tools, resources, and prompts it exposes, what responses they return, and what errors or delays to inject. Fixtures can be loaded programmatically or passed to the CLI. They can also be generated automatically by recording mode, which proxies requests to a real server and captures the interactions.

---

## 5. API Design

### Installation

```bash
npm install --save-dev mcp-server-mock
```

### Peer Dependency

```json
{
  "peerDependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0"
  }
}
```

### Main Export: `MockMCPServer`

The primary API is a class with a fluent builder pattern for configuration and lifecycle management.

```typescript
import { MockMCPServer } from 'mcp-server-mock';

const mock = new MockMCPServer({ name: 'test-server', version: '1.0.0' });

mock.tool('get_weather', {
  description: 'Get current weather for a city',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
    },
    required: ['city'],
  },
}).returns({
  content: [{ type: 'text', text: '72°F, sunny' }],
});

const { clientTransport, serverTransport } = mock.createInMemoryTransports();
await mock.connect(serverTransport);

// Connect the client under test to clientTransport
// ... run test assertions ...

await mock.close();
```

### Type Definitions

```typescript
// ── Server Configuration ─────────────────────────────────────────────

interface MockServerOptions {
  /** Server name reported in initialize response. */
  name: string;

  /** Server version reported in initialize response. */
  version: string;

  /**
   * Protocol version to advertise.
   * Default: '2025-11-25' (latest stable).
   */
  protocolVersion?: string;

  /**
   * Override automatic capability derivation.
   * By default, capabilities are derived from registered handlers.
   * Use this to test capability negotiation edge cases.
   */
  capabilities?: Partial<ServerCapabilities>;

  /**
   * Global delay applied to all responses unless overridden per-handler.
   * Default: 0 (no delay).
   */
  defaultDelayMs?: number;

  /**
   * If true, the server tracks client notifications and records them.
   * Default: true.
   */
  recordNotifications?: boolean;

  /**
   * If true, the server requires the full initialization handshake
   * before accepting operation requests.
   * Default: true.
   */
  enforceInitialization?: boolean;
}

interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, never>;
  completions?: Record<string, never>;
}

// ── Tool Registration ────────────────────────────────────────────────

interface ToolDefinition {
  /** Human-readable description of the tool. */
  description?: string;

  /** JSON Schema for tool input parameters. */
  inputSchema?: Record<string, unknown>;

  /** JSON Schema for tool output. */
  outputSchema?: Record<string, unknown>;

  /** Tool annotations (readOnlyHint, destructiveHint, etc.). */
  annotations?: ToolAnnotations;
}

interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Content item returned by tools. */
type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

interface ToolResponse {
  content: ToolContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

type ToolHandlerFn = (args: Record<string, unknown>, extra: RequestExtra) => ToolResponse | Promise<ToolResponse>;

/** Fluent builder returned by mock.tool(name, definition). */
interface ToolBuilder {
  /** Set a static response for this tool. */
  returns(response: ToolResponse): ToolBuilder;

  /** Set a dynamic handler function for this tool. */
  handler(fn: ToolHandlerFn): ToolBuilder;

  /** Make this tool return a JSON-RPC error. */
  throws(error: MockError): ToolBuilder;

  /** Add a delay before this tool responds. */
  withDelay(ms: number): ToolBuilder;

  /** Add random jitter to the delay. */
  withJitter(minMs: number, maxMs: number): ToolBuilder;

  /** Make this tool time out (never respond). */
  timesOut(): ToolBuilder;

  /** Make this tool respond only N times, then throw. */
  times(n: number): ToolBuilder;

  /** Make this tool respond differently based on scenario state. */
  inState(stateName: string, response: ToolResponse): ToolBuilder;
}

// ── Resource Registration ────────────────────────────────────────────

interface ResourceDefinition {
  /** Human-readable name of the resource. */
  name: string;

  /** Description of the resource. */
  description?: string;

  /** MIME type of the resource content. */
  mimeType?: string;

  /** Size of the resource in bytes. */
  size?: number;
}

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

interface ResourceResponse {
  contents: ResourceContent[];
}

type ResourceHandlerFn = (uri: string, extra: RequestExtra) => ResourceResponse | Promise<ResourceResponse>;

/** Fluent builder returned by mock.resource(uri, definition). */
interface ResourceBuilder {
  /** Set static content for this resource. */
  returns(response: ResourceResponse): ResourceBuilder;

  /** Set a dynamic handler function for this resource. */
  handler(fn: ResourceHandlerFn): ResourceBuilder;

  /** Make this resource return a JSON-RPC error. */
  throws(error: MockError): ResourceBuilder;

  /** Add a delay before this resource responds. */
  withDelay(ms: number): ResourceBuilder;

  /** Make this resource time out (never respond). */
  timesOut(): ResourceBuilder;

  /** Make this resource respond differently based on scenario state. */
  inState(stateName: string, response: ResourceResponse): ResourceBuilder;
}

// ── Resource Template Registration ───────────────────────────────────

interface ResourceTemplateDefinition {
  /** Human-readable name of the template. */
  name: string;

  /** Description of the template. */
  description?: string;

  /** URI template string (RFC 6570). */
  uriTemplate: string;

  /** MIME type of resources matching this template. */
  mimeType?: string;
}

// ── Prompt Registration ──────────────────────────────────────────────

interface PromptDefinition {
  /** Description of the prompt. */
  description?: string;

  /** Arguments accepted by the prompt. */
  arguments?: PromptArgument[];
}

interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface PromptMessage {
  role: 'user' | 'assistant';
  content:
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string } };
}

interface PromptResponse {
  description?: string;
  messages: PromptMessage[];
}

type PromptHandlerFn = (args: Record<string, string>, extra: RequestExtra) => PromptResponse | Promise<PromptResponse>;

/** Fluent builder returned by mock.prompt(name, definition). */
interface PromptBuilder {
  /** Set a static response for this prompt. */
  returns(response: PromptResponse): PromptBuilder;

  /** Set a dynamic handler function for this prompt. */
  handler(fn: PromptHandlerFn): PromptBuilder;

  /** Make this prompt return a JSON-RPC error. */
  throws(error: MockError): PromptBuilder;

  /** Add a delay before this prompt responds. */
  withDelay(ms: number): PromptBuilder;

  /** Make this prompt respond differently based on scenario state. */
  inState(stateName: string, response: PromptResponse): PromptBuilder;
}

// ── Completion Registration ──────────────────────────────────────────

interface CompletionResponse {
  completion: {
    values: string[];
    total?: number;
    hasMore?: boolean;
  };
}

type CompletionHandlerFn = (
  ref: { type: 'ref/prompt' | 'ref/resource'; name?: string; uri?: string },
  argument: { name: string; value: string },
  extra: RequestExtra,
) => CompletionResponse | Promise<CompletionResponse>;

// ── Error Simulation ─────────────────────────────────────────────────

interface MockError {
  /** JSON-RPC error code. Standard codes: -32600, -32601, -32602, -32603, -32700.
   *  Application codes: >= -32000. */
  code: number;

  /** Human-readable error message. */
  message: string;

  /** Optional structured error data. */
  data?: unknown;
}

/** Pre-built error factories. */
declare const MockErrors: {
  /** Method not found (-32601). */
  methodNotFound(method?: string): MockError;

  /** Invalid params (-32602). */
  invalidParams(message?: string): MockError;

  /** Internal error (-32603). */
  internalError(message?: string): MockError;

  /** Parse error (-32700). */
  parseError(): MockError;

  /** Invalid request (-32600). */
  invalidRequest(message?: string): MockError;

  /** Custom application error. */
  custom(code: number, message: string, data?: unknown): MockError;
};

// ── Request Recording ────────────────────────────────────────────────

interface RecordedRequest {
  /** Auto-incrementing sequence number. */
  seq: number;

  /** ISO 8601 timestamp of when the request was received. */
  timestamp: string;

  /** JSON-RPC method name (e.g., 'tools/call', 'resources/read'). */
  method: string;

  /** Full JSON-RPC params object. */
  params: Record<string, unknown>;

  /** JSON-RPC request ID. */
  id: string | number;

  /** Response that was sent back (including errors). */
  response: {
    result?: unknown;
    error?: MockError;
    durationMs: number;
  };
}

interface RecordedNotification {
  /** Auto-incrementing sequence number. */
  seq: number;

  /** ISO 8601 timestamp. */
  timestamp: string;

  /** Notification method. */
  method: string;

  /** Notification params. */
  params?: Record<string, unknown>;

  /** Direction: 'incoming' (client -> server) or 'outgoing' (server -> client). */
  direction: 'incoming' | 'outgoing';
}

// ── Request Extra ────────────────────────────────────────────────────

interface RequestExtra {
  /** The current scenario state, if scenarios are configured. */
  state?: string;

  /** The mock server instance, for dynamic handler access to server methods. */
  server: MockMCPServer;
}

// ── Scenario State Machine ───────────────────────────────────────────

interface ScenarioDefinition {
  /** Initial state name. */
  initialState: string;

  /** State transition rules. */
  transitions: ScenarioTransition[];
}

interface ScenarioTransition {
  /** Current state to match. */
  from: string;

  /** MCP method that triggers this transition. */
  method: string;

  /**
   * Optional matcher for request params.
   * If provided, the transition only fires if params match.
   */
  match?: Record<string, unknown> | ((params: Record<string, unknown>) => boolean);

  /** State to transition to. */
  to: string;
}

// ── Fixture File Format ──────────────────────────────────────────────

interface FixtureFile {
  /** Mock server configuration. */
  server: {
    name: string;
    version: string;
    protocolVersion?: string;
    defaultDelayMs?: number;
  };

  /** Tool definitions and responses. */
  tools?: FixtureTool[];

  /** Resource definitions and responses. */
  resources?: FixtureResource[];

  /** Resource template definitions. */
  resourceTemplates?: FixtureResourceTemplate[];

  /** Prompt definitions and responses. */
  prompts?: FixturePrompt[];

  /** Scenario state machine definition. */
  scenario?: ScenarioDefinition;
}

interface FixtureTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
  response?: ToolResponse;
  error?: MockError;
  delayMs?: number;
  /** State-dependent responses. Key is state name, value is response. */
  states?: Record<string, ToolResponse>;
}

interface FixtureResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  response?: ResourceResponse;
  error?: MockError;
  delayMs?: number;
  states?: Record<string, ResourceResponse>;
}

interface FixtureResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface FixturePrompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
  response?: PromptResponse;
  error?: MockError;
  delayMs?: number;
  states?: Record<string, PromptResponse>;
}

// ── Recording Mode ───────────────────────────────────────────────────

interface RecordingOptions {
  /** Transport config for the real server to proxy to. */
  target: RecordingTarget;

  /** File path to write the captured fixture file. */
  outputPath: string;

  /**
   * If true, redact argument values in recorded fixtures.
   * Useful for avoiding secrets in fixture files.
   * Default: false.
   */
  redactArguments?: boolean;

  /**
   * Custom transform applied to each recorded interaction before saving.
   * Use this to sanitize or modify captured responses.
   */
  transformInteraction?: (interaction: RecordedInteraction) => RecordedInteraction | null;
}

type RecordingTarget =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> };

interface RecordedInteraction {
  method: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: MockError;
  durationMs: number;
}
```

### `MockMCPServer` Class API

```typescript
class MockMCPServer {
  constructor(options: MockServerOptions);

  // ── Handler Registration (fluent) ──────────────────────────────────

  /** Register a tool. Returns a ToolBuilder for configuring responses. */
  tool(name: string, definition?: ToolDefinition): ToolBuilder;

  /** Register a resource. Returns a ResourceBuilder for configuring responses. */
  resource(uri: string, definition?: ResourceDefinition): ResourceBuilder;

  /** Register a resource template. */
  resourceTemplate(definition: ResourceTemplateDefinition): void;

  /** Register a prompt. Returns a PromptBuilder for configuring responses. */
  prompt(name: string, definition?: PromptDefinition): PromptBuilder;

  /** Register a completion handler. */
  completion(handler: CompletionHandlerFn): void;

  // ── Transport ──────────────────────────────────────────────────────

  /**
   * Create a pair of linked in-memory transports.
   * Returns the client-side and server-side transports.
   * The mock server should be connected to serverTransport.
   * The client under test should be connected to clientTransport.
   */
  createInMemoryTransports(): {
    clientTransport: import('@modelcontextprotocol/sdk/inMemory.js').InMemoryTransport;
    serverTransport: import('@modelcontextprotocol/sdk/inMemory.js').InMemoryTransport;
  };

  /**
   * Start the mock server on a Streamable HTTP transport.
   * Returns the URL and a close function.
   */
  listen(port?: number): Promise<{ url: string; close: () => Promise<void> }>;

  /**
   * Connect the mock server to a transport instance.
   * For in-memory: pass the serverTransport from createInMemoryTransports().
   * For custom transports: pass any object implementing the Transport interface.
   */
  connect(transport: import('@modelcontextprotocol/sdk/shared/transport.js').Transport): Promise<void>;

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Close the mock server and release all resources.
   * For HTTP mode, stops the HTTP server.
   * For stdio mode, closes stdin/stdout.
   * Always call this in test teardown.
   */
  close(): Promise<void>;

  /**
   * Reset all recorded requests and notifications.
   * Does not remove registered handlers.
   * Useful in beforeEach to start each test with clean recordings.
   */
  resetRecordings(): void;

  /**
   * Reset everything: handlers, recordings, scenario state.
   * Returns the server to its initial state.
   */
  resetAll(): void;

  // ── Scenario State ─────────────────────────────────────────────────

  /** Configure a scenario state machine. */
  scenario(definition: ScenarioDefinition): void;

  /** Get the current scenario state. */
  get currentState(): string | undefined;

  /** Manually set the scenario state (useful for test setup). */
  setState(stateName: string): void;

  // ── Request Recording ──────────────────────────────────────────────

  /** Get all recorded requests. */
  get requests(): ReadonlyArray<RecordedRequest>;

  /** Get all recorded notifications. */
  get notifications(): ReadonlyArray<RecordedNotification>;

  /** Get recorded requests filtered by method. */
  requestsFor(method: string): ReadonlyArray<RecordedRequest>;

  /** Get recorded tool call requests filtered by tool name. */
  toolCalls(toolName: string): ReadonlyArray<RecordedRequest>;

  /** Get recorded resource read requests filtered by URI. */
  resourceReads(uri: string): ReadonlyArray<RecordedRequest>;

  /** Get recorded prompt get requests filtered by prompt name. */
  promptGets(promptName: string): ReadonlyArray<RecordedRequest>;

  // ── Assertions ─────────────────────────────────────────────────────

  /** Assert that a tool was called. Throws if assertion fails. */
  assertToolCalled(toolName: string, times?: number): void;

  /** Assert that a tool was called with specific arguments. */
  assertToolCalledWith(toolName: string, args: Record<string, unknown>): void;

  /** Assert that a tool was never called. */
  assertToolNotCalled(toolName: string): void;

  /** Assert that a resource was read. */
  assertResourceRead(uri: string, times?: number): void;

  /** Assert that a prompt was retrieved. */
  assertPromptRetrieved(promptName: string, times?: number): void;

  /** Assert that any request with the given method was received. */
  assertMethodCalled(method: string, times?: number): void;

  /** Assert that no requests were received. */
  assertNoRequests(): void;

  /** Assert the total number of requests received. */
  assertRequestCount(count: number): void;

  // ── Server-Initiated Messages ──────────────────────────────────────

  /**
   * Send a notification from the server to the client.
   * Useful for testing client notification handling.
   */
  sendNotification(method: string, params?: Record<string, unknown>): Promise<void>;

  /** Send a tools/list_changed notification. */
  notifyToolsChanged(): Promise<void>;

  /** Send a resources/list_changed notification. */
  notifyResourcesChanged(): Promise<void>;

  /** Send a resources/updated notification for a specific resource. */
  notifyResourceUpdated(uri: string): Promise<void>;

  /** Send a prompts/list_changed notification. */
  notifyPromptsChanged(): Promise<void>;

  /** Send a progress notification for a request. */
  sendProgress(progressToken: string | number, progress: number, total?: number, message?: string): Promise<void>;

  /** Send a log message notification. */
  sendLogMessage(level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency', data: unknown, logger?: string): Promise<void>;

  // ── Dynamic Handler Modification ───────────────────────────────────

  /** Remove a registered tool. */
  removeTool(name: string): void;

  /** Remove a registered resource. */
  removeResource(uri: string): void;

  /** Remove a registered prompt. */
  removePrompt(name: string): void;

  // ── Fixture Loading ────────────────────────────────────────────────

  /** Load a fixture file and configure the server from it. */
  loadFixture(fixture: FixtureFile): void;

  /** Load a fixture from a JSON file path. */
  loadFixtureFile(filePath: string): Promise<void>;

  // ── Recording Mode ─────────────────────────────────────────────────

  /**
   * Start recording mode. The mock server proxies requests to a real
   * server and captures all interactions.
   */
  static record(options: RecordingOptions): Promise<MockMCPServer>;
}
```

### Example: Basic Tool Stubbing

```typescript
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

mock.tool('search', {
  description: 'Search the web',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
}).returns({
  content: [{ type: 'text', text: 'Result: TypeScript is great' }],
});

const { clientTransport, serverTransport } = mock.createInMemoryTransports();
await mock.connect(serverTransport);

const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(clientTransport);

const result = await client.callTool({ name: 'search', arguments: { query: 'TypeScript' } });
console.log(result.content); // [{ type: 'text', text: 'Result: TypeScript is great' }]

mock.assertToolCalled('search', 1);
mock.assertToolCalledWith('search', { query: 'TypeScript' });

await client.close();
await mock.close();
```

### Example: Dynamic Handler

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

mock.tool('calculate', {
  description: 'Add two numbers',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' },
    },
    required: ['a', 'b'],
  },
}).handler((args) => ({
  content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }],
}));
```

### Example: Error Simulation

```typescript
import { MockMCPServer, MockErrors } from 'mcp-server-mock';

const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

// Tool that always errors
mock.tool('dangerous_op').throws(MockErrors.internalError('Database connection failed'));

// Tool that errors after 2 successful calls
mock.tool('flaky_api', {
  inputSchema: { type: 'object' },
}).returns({
  content: [{ type: 'text', text: 'success' }],
}).times(2);
// After 2 calls, subsequent calls throw: "Handler exhausted after 2 calls"
```

### Example: Delay and Timeout Simulation

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

// Tool with fixed 500ms delay
mock.tool('slow_api').returns({
  content: [{ type: 'text', text: 'eventually...' }],
}).withDelay(500);

// Tool with random jitter between 100-2000ms
mock.tool('jittery_api').returns({
  content: [{ type: 'text', text: 'maybe fast, maybe slow' }],
}).withJitter(100, 2000);

// Tool that never responds (for testing client timeout handling)
mock.tool('black_hole').timesOut();
```

### Example: Resource Mocking

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

mock.resource('file:///config.json', {
  name: 'Application Config',
  description: 'Application configuration file',
  mimeType: 'application/json',
}).returns({
  contents: [{
    uri: 'file:///config.json',
    mimeType: 'application/json',
    text: JSON.stringify({ debug: true, maxRetries: 3 }),
  }],
});
```

### Example: Prompt Mocking

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

mock.prompt('code_review', {
  description: 'Review code for issues',
  arguments: [
    { name: 'language', description: 'Programming language', required: true },
    { name: 'style', description: 'Review style', required: false },
  ],
}).returns({
  description: 'Code review prompt',
  messages: [
    {
      role: 'user',
      content: { type: 'text', text: 'Please review the following code for best practices.' },
    },
  ],
});
```

### Example: Scenario State Machine

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

mock.scenario({
  initialState: 'unauthenticated',
  transitions: [
    { from: 'unauthenticated', method: 'tools/call', match: { name: 'login' }, to: 'authenticated' },
    { from: 'authenticated', method: 'tools/call', match: { name: 'logout' }, to: 'unauthenticated' },
  ],
});

mock.tool('login', {
  inputSchema: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] },
}).inState('unauthenticated', {
  content: [{ type: 'text', text: 'Login successful' }],
}).inState('authenticated', {
  content: [{ type: 'text', text: 'Already logged in' }],
});

mock.tool('get_data', {
  inputSchema: { type: 'object' },
}).inState('unauthenticated', {
  content: [{ type: 'text', text: 'Error: Not authenticated' }],
  isError: true,
}).inState('authenticated', {
  content: [{ type: 'text', text: '{"data": [1, 2, 3]}' }],
});
```

---

## 6. Transport Support

### In-Memory Transport

The in-memory transport is the primary transport for unit tests. It uses `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk` to create two connected transports that communicate via direct function calls with no I/O.

```typescript
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
mock.tool('ping').returns({ content: [{ type: 'text', text: 'pong' }] });

const { clientTransport, serverTransport } = mock.createInMemoryTransports();
await mock.connect(serverTransport);

const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(clientTransport);

// Test your client code...

await client.close();
await mock.close();
```

**Advantages**: Zero startup overhead, no subprocess management, no port allocation, deterministic timing (except for configured delays), runs identically on all platforms. **When to use**: Unit tests, fast feedback loops, CI environments where speed matters.

### Stdio Transport

The stdio transport runs the mock server as a subprocess. The test process spawns the mock server CLI with a fixture file, and connects an MCP client to it via `StdioClientTransport`.

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['mcp-server-mock', '--fixture', './test-fixtures/weather-server.json'],
});

const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

// Test your client code over real stdio transport...

await client.close();
```

**Advantages**: Tests the real stdio JSON-RPC framing, subprocess lifecycle, signal handling, and stdin/stdout interaction. **When to use**: Integration tests that need to verify transport-level behavior, tests that exercise subprocess management code in the client, tests that mirror production deployment topology.

### Streamable HTTP Transport

The HTTP transport runs the mock server on a local HTTP port. The test connects an MCP client via `StreamableHTTPClientTransport`.

```typescript
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
mock.tool('echo').returns({ content: [{ type: 'text', text: 'hello' }] });

const { url, close } = await mock.listen(0); // port 0 = OS-assigned

const transport = new StreamableHTTPClientTransport(new URL(url));
const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

// Test your client code over real HTTP transport...

await client.close();
await close();
```

**Advantages**: Tests the real HTTP transport path, session management via `Mcp-Session-Id`, SSE streaming, HTTP error codes, and header handling. **When to use**: Integration tests for HTTP-based MCP client code, tests that verify session management, tests that exercise HTTP-specific error handling.

---

## 7. Canned Responses

### Static Responses

The simplest form of mocking: register a fixed response that is returned every time the tool, resource, or prompt is requested.

```typescript
// Tool with text response
mock.tool('greet').returns({
  content: [{ type: 'text', text: 'Hello, world!' }],
});

// Tool with structured content
mock.tool('get_user').returns({
  content: [{ type: 'text', text: '{"id": 1, "name": "Alice"}' }],
  structuredContent: { id: 1, name: 'Alice' },
});

// Tool with error flag
mock.tool('fail_gracefully').returns({
  content: [{ type: 'text', text: 'Something went wrong' }],
  isError: true,
});

// Tool with image content
mock.tool('screenshot').returns({
  content: [{
    type: 'image',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
  }],
});

// Resource with text content
mock.resource('config://app', { name: 'App Config' }).returns({
  contents: [{
    uri: 'config://app',
    mimeType: 'application/json',
    text: '{"debug": true}',
  }],
});

// Resource with binary content
mock.resource('file:///logo.png', { name: 'Logo', mimeType: 'image/png' }).returns({
  contents: [{
    uri: 'file:///logo.png',
    mimeType: 'image/png',
    blob: 'iVBORw0KGgoAAAANSUhEUg...',
  }],
});
```

### Dynamic Responses

Handler functions compute responses based on request arguments. This is useful when the test needs the mock to behave like a simplified version of the real server.

```typescript
mock.tool('add', {
  inputSchema: {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
    required: ['a', 'b'],
  },
}).handler((args) => ({
  content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }],
}));

mock.resource('db://users/{id}', { name: 'User by ID' }).handler((uri) => {
  const id = uri.split('/').pop();
  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify({ id, name: `User ${id}`, email: `user${id}@example.com` }),
    }],
  };
});
```

### Sequenced Responses

A tool can return different responses on successive calls using `.times()` combined with re-registration:

```typescript
// First 2 calls succeed, subsequent calls fail
mock.tool('rate_limited_api').returns({
  content: [{ type: 'text', text: 'OK' }],
}).times(2);
// After exhaustion, the handler throws MockErrors.custom(-32000, 'Rate limited')
```

For more complex sequences, use a handler function with internal state:

```typescript
let callCount = 0;
mock.tool('progressive').handler(() => {
  callCount++;
  if (callCount <= 3) {
    return { content: [{ type: 'text', text: `Call ${callCount}: warming up` }] };
  }
  return { content: [{ type: 'text', text: `Call ${callCount}: at full speed` }] };
});
```

---

## 8. Error Simulation

### JSON-RPC Protocol Errors

The mock server can simulate any standard JSON-RPC error:

```typescript
import { MockErrors } from 'mcp-server-mock';

// Standard JSON-RPC errors
mock.tool('not_found').throws(MockErrors.methodNotFound('tools/call'));
mock.tool('bad_args').throws(MockErrors.invalidParams('Missing required field: query'));
mock.tool('server_crash').throws(MockErrors.internalError('Unexpected null pointer'));
mock.tool('parse_fail').throws(MockErrors.parseError());
mock.tool('bad_request').throws(MockErrors.invalidRequest('Duplicate request ID'));

// Custom application error
mock.tool('quota_exceeded').throws(MockErrors.custom(
  -32000,
  'API quota exceeded',
  { retryAfter: 60, limit: 100, remaining: 0 },
));
```

### Transport-Level Errors

The mock server can simulate transport-level failures that manifest as connection drops, stream interruptions, or subprocess crashes:

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

// Simulate a server that crashes mid-response
mock.tool('crash_midway').handler(async (args, { server }) => {
  // Send partial progress, then crash the transport
  await server.sendProgress('token', 50, 100, 'Processing...');
  await server.simulateTransportClose();
  // The client should receive a transport error
  return { content: [] }; // Never reached
});

// Simulate a connection that drops after initialization
mock.onAfterInitialize(async (server) => {
  await new Promise(resolve => setTimeout(resolve, 100));
  await server.simulateTransportClose();
});
```

### Timeout Simulation

```typescript
// Tool that never responds -- client must handle timeout
mock.tool('black_hole').timesOut();

// Tool that responds after a configurable delay
// Useful for testing client timeout thresholds
mock.tool('almost_timeout').returns({
  content: [{ type: 'text', text: 'just in time' }],
}).withDelay(9500); // If client timeout is 10s, this barely succeeds
```

### Malformed Response Simulation

For testing client robustness against protocol violations:

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

// Send a response with missing required fields
mock.interceptResponse('tools/call', (response) => {
  // Remove the content field to simulate a malformed response
  delete response.result.content;
  return response;
});

// Send a response with wrong types
mock.interceptResponse('tools/list', (response) => {
  // Return tools as a string instead of an array
  response.result.tools = 'not an array';
  return response;
});
```

### Initialization Errors

For testing client behavior when the handshake fails:

```typescript
// Server that rejects initialization with a version mismatch
const mock = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  protocolVersion: '1999-01-01', // Nonsense version
});

// Server that accepts initialize but never sends initialized acknowledgment
const mock2 = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  enforceInitialization: false,
});
mock2.onInitialize(() => {
  // Intentionally do not complete the handshake
  throw new Error('Server initialization failed');
});
```

### Error Catalog

| Error Type | Simulation Method | Use Case |
|-----------|-------------------|----------|
| Method not found | `MockErrors.methodNotFound()` | Client calls an unsupported method |
| Invalid params | `MockErrors.invalidParams()` | Client sends wrong argument types |
| Internal server error | `MockErrors.internalError()` | Server-side crash during processing |
| Parse error | `MockErrors.parseError()` | Malformed JSON in transport |
| Custom app error | `MockErrors.custom(code, msg)` | Application-specific errors (rate limit, auth, quota) |
| Transport close | `server.simulateTransportClose()` | Network disconnection, process crash |
| Timeout | `.timesOut()` | Server hangs, never responds |
| Malformed response | `interceptResponse()` | Protocol violation in response |
| Initialization failure | Custom `onInitialize` | Handshake rejection |

---

## 9. Delay and Latency Simulation

### Fixed Delay

Apply a constant delay before a handler responds. The delay is measured from when the request is received to when the response is sent.

```typescript
// All tools delayed by 200ms
const mock = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  defaultDelayMs: 200,
});

// Per-tool delay overrides the default
mock.tool('fast').returns({ content: [{ type: 'text', text: 'quick' }] }).withDelay(0);
mock.tool('slow').returns({ content: [{ type: 'text', text: 'slow' }] }).withDelay(2000);
```

### Random Jitter

Apply a random delay uniformly distributed between `minMs` and `maxMs`. Useful for simulating real-world latency variance.

```typescript
mock.tool('api_call').returns({
  content: [{ type: 'text', text: 'data' }],
}).withJitter(50, 500);
```

The delay for each call is computed as: `minMs + Math.random() * (maxMs - minMs)`.

### Progressive Slowdown

Use a handler function to simulate a server that degrades over time:

```typescript
let callCount = 0;
mock.tool('degrading_service').handler(async (args) => {
  callCount++;
  const delay = Math.min(callCount * 100, 5000); // 100ms, 200ms, ..., 5000ms cap
  await new Promise(resolve => setTimeout(resolve, delay));
  return { content: [{ type: 'text', text: `Response after ${delay}ms` }] };
});
```

### Timeout Testing

The `.timesOut()` modifier causes the handler to never resolve, testing the client's timeout handling. The mock server holds the request open indefinitely. The client must either time out (via its own timeout configuration) or abort (via `AbortSignal`).

```typescript
mock.tool('black_hole').timesOut();

// In the client test:
const client = new Client({ name: 'test', version: '1.0.0' });
await client.connect(clientTransport);

try {
  await client.callTool(
    { name: 'black_hole', arguments: {} },
    undefined,
    { timeout: 5000 },
  );
  throw new Error('Should have timed out');
} catch (err) {
  expect(err.message).toContain('timeout');
}
```

### Delay on Resources and Prompts

Delay modifiers work identically on resources and prompts:

```typescript
mock.resource('db://slow-query', { name: 'Slow Query' }).returns({
  contents: [{ uri: 'db://slow-query', text: 'result' }],
}).withDelay(3000);

mock.prompt('heavy_prompt', { description: 'Complex prompt' }).returns({
  messages: [{ role: 'user', content: { type: 'text', text: 'Think deeply...' } }],
}).withJitter(500, 2000);
```

---

## 10. Request Recording and Assertions

### Automatic Recording

Every request and notification received by the mock server is automatically recorded with full details:

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
mock.tool('search').returns({ content: [{ type: 'text', text: 'found it' }] });

// ... client makes requests ...

// Access all recordings
console.log(mock.requests);
// [
//   {
//     seq: 1,
//     timestamp: '2025-03-18T10:00:00.000Z',
//     method: 'tools/call',
//     params: { name: 'search', arguments: { query: 'test' } },
//     id: 1,
//     response: { result: { content: [...] }, durationMs: 2 },
//   },
// ]

// Filter by method
const toolCalls = mock.requestsFor('tools/call');

// Filter by tool name
const searchCalls = mock.toolCalls('search');

// Access notification recordings
console.log(mock.notifications);
```

### Built-in Assertion Methods

Assertion methods throw descriptive errors when expectations are not met, making test failures clear:

```typescript
// Assert call count
mock.assertToolCalled('search');          // Called at least once
mock.assertToolCalled('search', 3);       // Called exactly 3 times
mock.assertToolNotCalled('delete_all');   // Never called

// Assert arguments
mock.assertToolCalledWith('search', { query: 'TypeScript' });

// Assert resource reads
mock.assertResourceRead('file:///config.json');
mock.assertResourceRead('file:///config.json', 2);

// Assert prompt retrievals
mock.assertPromptRetrieved('code_review');

// Assert any method
mock.assertMethodCalled('initialize', 1);
mock.assertMethodCalled('tools/list');

// Assert no activity
mock.assertNoRequests();

// Assert total count
mock.assertRequestCount(5);
```

### Assertion Error Messages

When an assertion fails, the error message includes enough context to diagnose the failure without inspecting recordings manually:

```
AssertionError: Expected tool "search" to be called 3 times, but it was called 1 time.
  Actual calls:
    [1] search({ query: "TypeScript" }) at 2025-03-18T10:00:00.000Z → { content: [{ type: "text", text: "found it" }] }
```

```
AssertionError: Expected tool "search" to be called with { query: "Python" }, but no matching call was found.
  Actual calls:
    [1] search({ query: "TypeScript" }) at 2025-03-18T10:00:00.000Z
    [2] search({ query: "Rust" }) at 2025-03-18T10:00:01.000Z
```

### Argument Matching

`assertToolCalledWith` performs deep equality comparison on arguments. For partial matching or pattern-based matching, use the recorded requests directly:

```typescript
// Exact match
mock.assertToolCalledWith('search', { query: 'TypeScript', limit: 10 });

// Partial match (manual)
const calls = mock.toolCalls('search');
const hasPartialMatch = calls.some(
  c => (c.params as any).arguments?.query === 'TypeScript',
);
expect(hasPartialMatch).toBe(true);

// Pattern match (manual)
const hasPatternMatch = calls.some(
  c => /type/i.test((c.params as any).arguments?.query),
);
expect(hasPatternMatch).toBe(true);
```

### Resetting Recordings

Between tests, reset recordings to isolate test cases:

```typescript
beforeEach(() => {
  mock.resetRecordings(); // Clear recordings, keep handlers
});
```

---

## 11. Scenarios and State Machines

### Overview

Scenarios enable multi-step interaction testing. A scenario is a finite state machine that transitions between named states based on received requests. Handlers can return different responses depending on the current state.

### Defining a Scenario

```typescript
mock.scenario({
  initialState: 'idle',
  transitions: [
    { from: 'idle', method: 'tools/call', match: { name: 'start_session' }, to: 'active' },
    { from: 'active', method: 'tools/call', match: { name: 'end_session' }, to: 'idle' },
    { from: 'active', method: 'tools/call', match: { name: 'fetch_data' }, to: 'data_loaded' },
    { from: 'data_loaded', method: 'tools/call', match: { name: 'process_data' }, to: 'processed' },
    { from: 'processed', method: 'tools/call', match: { name: 'end_session' }, to: 'idle' },
  ],
});
```

### State-Dependent Responses

Register different responses for different states:

```typescript
mock.tool('fetch_data')
  .inState('idle', { content: [{ type: 'text', text: 'Error: no active session' }], isError: true })
  .inState('active', { content: [{ type: 'text', text: '{"items": [1, 2, 3]}' }] })
  .inState('data_loaded', { content: [{ type: 'text', text: '{"items": [1, 2, 3]}' }] });
```

When a request arrives, the mock server:

1. Looks up the current scenario state.
2. Checks if any transition rule matches the incoming request.
3. If a matching transition exists, moves to the new state.
4. Looks up the handler for the current state (after transition).
5. Returns the state-appropriate response.

### Transition Matching

Transitions match on `method` and optionally on `match`:

- **String match on `method`**: The JSON-RPC method must match exactly (e.g., `'tools/call'`).
- **Object match on `match`**: The request params must contain all key-value pairs in the match object (shallow partial match). For `tools/call`, the `name` field in params identifies the tool.
- **Function match on `match`**: A predicate function receives the full params object and returns boolean.

```typescript
// Match any tools/call request
{ from: 'a', method: 'tools/call', to: 'b' }

// Match tools/call for a specific tool
{ from: 'a', method: 'tools/call', match: { name: 'login' }, to: 'b' }

// Match tools/call with a custom predicate
{ from: 'a', method: 'tools/call', match: (params) => params.name === 'login' && params.arguments?.admin === true, to: 'b' }
```

### State Inspection

Tests can inspect and manipulate the current state:

```typescript
expect(mock.currentState).toBe('idle');

// Manually set state for test setup
mock.setState('active');

// Verify state after client interactions
await client.callTool({ name: 'start_session', arguments: {} });
expect(mock.currentState).toBe('active');
```

### Default State Handling

If a handler does not have a state-specific response for the current state, the mock server falls back to the non-state response (if registered) or throws a `MockErrors.internalError('No handler for tool "X" in state "Y"')` error.

---

## 12. Protocol Edge Cases

### Capability Negotiation Failures

Test client behavior when the server does not support expected capabilities:

```typescript
// Server with no tools capability
const mock = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  capabilities: { tools: undefined, resources: {}, prompts: {} },
});
// Client calling tools/list on this server will get MethodNotFound
```

### Version Mismatches

Test client behavior when the server advertises an unexpected protocol version:

```typescript
const mock = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
  protocolVersion: '2024-11-05', // Older version
});
```

### Unexpected Notifications

Test client handling of unsolicited notifications:

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
mock.tool('trigger').handler(async (args, { server }) => {
  // Send unexpected notification during tool execution
  await server.sendNotification('notifications/tools/list_changed');
  return { content: [{ type: 'text', text: 'done' }] };
});
```

### Server-Initiated Messages

Test client handling of server-to-client requests (like `sampling/createMessage`):

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

// After initialization, send a sampling request from the server
mock.tool('complex_task').handler(async (args, { server }) => {
  // This simulates a server that needs to ask the client for an LLM completion
  // The client must have declared the sampling capability
  await server.sendNotification('notifications/message', {
    level: 'info',
    data: 'Processing complex task...',
  });
  return { content: [{ type: 'text', text: 'Task complete' }] };
});
```

### Pagination

Test client handling of paginated list responses:

```typescript
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

// Register 100 tools to force pagination
for (let i = 0; i < 100; i++) {
  mock.tool(`tool_${i}`, { description: `Tool number ${i}` }).returns({
    content: [{ type: 'text', text: `Result from tool ${i}` }],
  });
}

// The mock server automatically paginates tools/list responses.
// Default page size is 50. Override with:
mock.setPageSize(10); // Return 10 items per page
```

### Duplicate Request IDs

Test client handling when the server receives duplicate request IDs (which should not happen in well-behaved clients, but robust servers handle gracefully):

```typescript
// The mock server can be configured to track and reject duplicate IDs
const mock = new MockMCPServer({
  name: 'test',
  version: '1.0.0',
});
mock.setStrictMode(true); // Rejects duplicate request IDs with InvalidRequest error
```

### Out-of-Order Responses

Test client handling when responses arrive in a different order than requests were sent. This is a valid JSON-RPC behavior since requests are identified by ID, not sequence:

```typescript
mock.tool('fast').returns({ content: [{ type: 'text', text: 'fast result' }] }).withDelay(10);
mock.tool('slow').returns({ content: [{ type: 'text', text: 'slow result' }] }).withDelay(1000);

// If client sends slow first, then fast, the fast response arrives first.
// This tests that the client correctly correlates responses by ID.
```

---

## 13. Fixture Files

### Format

Fixture files are JSON documents that define the mock server configuration declaratively. They are designed to be generated by recording mode, hand-authored for specific test scenarios, or version-controlled alongside test suites.

```json
{
  "server": {
    "name": "weather-api",
    "version": "2.0.0",
    "protocolVersion": "2025-11-25",
    "defaultDelayMs": 50
  },
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "City name" },
          "units": { "type": "string", "enum": ["celsius", "fahrenheit"], "description": "Temperature units" }
        },
        "required": ["city"]
      },
      "annotations": {
        "readOnlyHint": true,
        "openWorldHint": true
      },
      "response": {
        "content": [
          { "type": "text", "text": "{\"temperature\": 72, \"condition\": \"sunny\", \"humidity\": 45}" }
        ]
      }
    },
    {
      "name": "get_forecast",
      "description": "Get 5-day forecast",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" },
          "days": { "type": "number" }
        },
        "required": ["city"]
      },
      "response": {
        "content": [
          { "type": "text", "text": "[{\"day\": \"Mon\", \"high\": 75}, {\"day\": \"Tue\", \"high\": 68}]" }
        ]
      },
      "delayMs": 200
    }
  ],
  "resources": [
    {
      "uri": "config://api-settings",
      "name": "API Settings",
      "description": "Weather API configuration",
      "mimeType": "application/json",
      "response": {
        "contents": [
          {
            "uri": "config://api-settings",
            "mimeType": "application/json",
            "text": "{\"apiKey\": \"test-key\", \"maxRequests\": 100}"
          }
        ]
      }
    }
  ],
  "prompts": [
    {
      "name": "weather_report",
      "description": "Generate a weather report",
      "arguments": [
        { "name": "city", "description": "City name", "required": true },
        { "name": "style", "description": "Report style (brief/detailed)", "required": false }
      ],
      "response": {
        "description": "Weather report prompt",
        "messages": [
          {
            "role": "user",
            "content": {
              "type": "text",
              "text": "Please write a weather report for the given city."
            }
          }
        ]
      }
    }
  ]
}
```

### Fixture with Scenarios

```json
{
  "server": { "name": "stateful-api", "version": "1.0.0" },
  "tools": [
    {
      "name": "login",
      "inputSchema": { "type": "object", "properties": { "token": { "type": "string" } } },
      "states": {
        "logged_out": { "content": [{ "type": "text", "text": "Login successful" }] },
        "logged_in": { "content": [{ "type": "text", "text": "Already logged in" }] }
      }
    },
    {
      "name": "get_profile",
      "states": {
        "logged_out": { "content": [{ "type": "text", "text": "Unauthorized" }], "isError": true },
        "logged_in": { "content": [{ "type": "text", "text": "{\"name\": \"Alice\"}" }] }
      }
    }
  ],
  "scenario": {
    "initialState": "logged_out",
    "transitions": [
      { "from": "logged_out", "method": "tools/call", "match": { "name": "login" }, "to": "logged_in" },
      { "from": "logged_in", "method": "tools/call", "match": { "name": "logout" }, "to": "logged_out" }
    ]
  }
}
```

### Fixture with Error Simulation

```json
{
  "server": { "name": "error-test", "version": "1.0.0" },
  "tools": [
    {
      "name": "always_fails",
      "error": {
        "code": -32603,
        "message": "Internal error: database unavailable"
      }
    },
    {
      "name": "rate_limited",
      "error": {
        "code": -32000,
        "message": "Rate limit exceeded",
        "data": { "retryAfter": 30 }
      }
    }
  ]
}
```

### Loading Fixtures

```typescript
// From a file path
const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
await mock.loadFixtureFile('./fixtures/weather-server.json');

// From an object (useful for inline test fixtures)
mock.loadFixture({
  server: { name: 'inline-test', version: '1.0.0' },
  tools: [{
    name: 'echo',
    response: { content: [{ type: 'text', text: 'echoed' }] },
  }],
});
```

### Fixture Validation

When loading a fixture, the mock server validates:

- Required fields (`server.name`, `server.version`) are present.
- Tool, resource, and prompt names are unique within their category.
- Input schemas are valid JSON Schema objects (basic structural check, not full JSON Schema validation).
- State names in `states` match states defined in `scenario.transitions`.
- Error objects have required `code` and `message` fields.
- Responses have the correct structure for their type (tools have `content`, resources have `contents`, prompts have `messages`).

Validation errors throw with descriptive messages identifying the exact fixture field that is invalid.

---

## 14. Configuration

### `MockServerOptions` Defaults

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | Required | Server name in `initialize` response. |
| `version` | `string` | Required | Server version in `initialize` response. |
| `protocolVersion` | `string` | `'2025-11-25'` | Protocol version advertised during handshake. |
| `capabilities` | `Partial<ServerCapabilities>` | Auto-derived | Override automatic capability derivation from handlers. |
| `defaultDelayMs` | `number` | `0` | Global delay applied to all responses. |
| `recordNotifications` | `boolean` | `true` | Whether to record notifications in the recording log. |
| `enforceInitialization` | `boolean` | `true` | Require full handshake before accepting operation requests. |

### Per-Handler Configuration

| Modifier | Applicable To | Description |
|----------|---------------|-------------|
| `.returns(response)` | Tools, Resources, Prompts | Static canned response. |
| `.handler(fn)` | Tools, Resources, Prompts | Dynamic response function. |
| `.throws(error)` | Tools, Resources, Prompts | Return a JSON-RPC error. |
| `.withDelay(ms)` | Tools, Resources, Prompts | Fixed delay before response. |
| `.withJitter(min, max)` | Tools | Random delay in [min, max] range. |
| `.timesOut()` | Tools, Resources, Prompts | Never respond. |
| `.times(n)` | Tools | Respond N times, then throw exhaustion error. |
| `.inState(state, response)` | Tools, Resources, Prompts | State-dependent static response. |

### Advanced Configuration Methods

| Method | Description |
|--------|-------------|
| `mock.setPageSize(n)` | Set the page size for paginated list responses. Default: 50. |
| `mock.setStrictMode(flag)` | Enable strict protocol enforcement (reject duplicate IDs, validate params). Default: false. |
| `mock.interceptResponse(method, fn)` | Intercept and modify responses before they are sent to the client. |
| `mock.onAfterInitialize(fn)` | Register a callback that runs after successful initialization. |
| `mock.onInitialize(fn)` | Override the default initialization handler. |

---

## 15. Integration with Test Frameworks

### Vitest

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('MyMCPClient', () => {
  let mock: MockMCPServer;
  let client: Client;

  beforeEach(async () => {
    mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
    mock.tool('search', {
      description: 'Search',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    }).returns({
      content: [{ type: 'text', text: 'result' }],
    });

    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await mock.close();
  });

  it('should call search tool', async () => {
    const result = await client.callTool({ name: 'search', arguments: { q: 'test' } });
    expect(result.content).toEqual([{ type: 'text', text: 'result' }]);
    mock.assertToolCalled('search', 1);
  });

  it('should enumerate tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('search');
  });
});
```

### Jest

The same pattern applies to Jest, as `MockMCPServer` has no framework-specific dependencies. The assertion methods (`assertToolCalled`, etc.) throw standard `Error` instances that Jest catches and reports.

```typescript
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('MyMCPClient', () => {
  let mock: MockMCPServer;
  let client: Client;

  beforeEach(async () => {
    mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
    mock.tool('get_user').returns({
      content: [{ type: 'text', text: '{"id": 1, "name": "Alice"}' }],
    });

    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await mock.close();
  });

  test('fetches user data', async () => {
    const result = await client.callTool({ name: 'get_user', arguments: { id: 1 } });
    expect(result.content[0]).toEqual({ type: 'text', text: '{"id": 1, "name": "Alice"}' });
    mock.assertToolCalled('get_user');
  });
});
```

### Mocha

```typescript
import { expect } from 'chai';
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('MyMCPClient', function () {
  let mock: MockMCPServer;
  let client: Client;

  beforeEach(async function () {
    mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
    mock.tool('echo').returns({
      content: [{ type: 'text', text: 'echoed' }],
    });

    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async function () {
    await client.close();
    await mock.close();
  });

  it('should echo', async function () {
    const result = await client.callTool({ name: 'echo', arguments: {} });
    expect(result.content[0].text).to.equal('echoed');
    mock.assertToolCalled('echo', 1);
  });
});
```

### Helper: `createMockSetup`

A convenience function that creates a mock server, connects it, and returns everything needed for testing:

```typescript
import { createMockSetup } from 'mcp-server-mock';

const { mock, client, cleanup } = await createMockSetup({
  server: { name: 'test', version: '1.0.0' },
  tools: [
    { name: 'search', response: { content: [{ type: 'text', text: 'found' }] } },
  ],
});

// Use mock and client...
// Call cleanup() in afterEach
await cleanup();
```

---

## 16. CLI

### Installation and Invocation

```bash
# Global install
npm install -g mcp-server-mock
mcp-server-mock --fixture ./fixtures/weather.json

# npx (no install)
npx mcp-server-mock --fixture ./fixtures/weather.json

# Package script
# package.json: { "scripts": { "mock-server": "mcp-server-mock --fixture ./fixtures/weather.json" } }
npm run mock-server
```

### CLI Binary Name

`mcp-server-mock`

### Commands and Flags

```
mcp-server-mock [options]

Required:
  --fixture <path>         Path to a fixture JSON file defining the mock server.

Transport (default: stdio):
  --stdio                  Run as stdio server (default). Reads JSON-RPC from stdin, writes to stdout.
  --http [port]            Run as Streamable HTTP server on the specified port. Default: 3000.

Options:
  --delay <ms>             Global delay for all responses. Overrides fixture defaultDelayMs.
  --strict                 Enable strict protocol enforcement.
  --page-size <n>          Page size for paginated responses. Default: 50.
  --verbose                Log all requests and responses to stderr.
  --silent                 Suppress all stderr output.

Recording:
  --record                 Enable recording mode.
  --record-target <cmd>    stdio command for the real server to proxy to.
  --record-url <url>       HTTP URL for the real server to proxy to.
  --record-output <path>   File path to write the recorded fixture.

Meta:
  --version                Print version and exit.
  --help                   Print help and exit.
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Server shut down cleanly (received EOF on stdin or SIGTERM). |
| `1` | Error: fixture file not found, invalid fixture, or startup failure. |
| `2` | Configuration error: invalid flags or missing required options. |

### Usage Examples

```bash
# Run a mock server with a fixture file over stdio
mcp-server-mock --fixture ./fixtures/weather.json

# Run over HTTP for manual testing with curl or MCP Inspector
mcp-server-mock --fixture ./fixtures/weather.json --http 3000

# Run with verbose logging to see all requests
mcp-server-mock --fixture ./fixtures/weather.json --verbose

# Record interactions with a real server
mcp-server-mock --record --record-target 'node ./real-server.js' --record-output ./fixtures/recorded.json

# Record interactions with a remote HTTP server
mcp-server-mock --record --record-url https://mcp.example.com/mcp --record-output ./fixtures/recorded.json
```

### Connecting Claude Desktop or Other Hosts

The CLI mode is useful for configuring the mock server in `claude_desktop_config.json` or similar host configuration files during development:

```json
{
  "mcpServers": {
    "mock-weather": {
      "command": "npx",
      "args": ["mcp-server-mock", "--fixture", "/path/to/weather-fixture.json"]
    }
  }
}
```

---

## 17. Recording Mode

### Overview

Recording mode proxies MCP requests to a real server, captures all request-response pairs, and serializes them as a fixture file. This mirrors nock's recording functionality and WireMock's record/playback capability. Recording mode is useful for:

- Creating fixture files from an existing server without hand-authoring them.
- Capturing realistic responses for use in regression tests.
- Generating baseline fixtures that can be modified for edge case testing.

### How Recording Works

1. The mock server connects to the real (target) server using the specified transport.
2. When a client connects to the mock server, all initialization, tool calls, resource reads, and prompt retrievals are forwarded to the real server.
3. The real server's responses are captured alongside the requests.
4. When the session ends (client disconnects or SIGTERM), the captured interactions are written as a fixture file.

### Programmatic Recording

```typescript
import { MockMCPServer } from 'mcp-server-mock';

const mock = await MockMCPServer.record({
  target: {
    type: 'stdio',
    command: 'node',
    args: ['./real-weather-server.js'],
  },
  outputPath: './fixtures/weather-recorded.json',
});

const { clientTransport, serverTransport } = mock.createInMemoryTransports();
await mock.connect(serverTransport);

// Connect your client and exercise the real server through the proxy
const client = new Client({ name: 'recorder', version: '1.0.0' });
await client.connect(clientTransport);

await client.listTools();
await client.callTool({ name: 'get_weather', arguments: { city: 'London' } });
await client.callTool({ name: 'get_forecast', arguments: { city: 'London', days: 5 } });

await client.close();
await mock.close();
// Fixture file is now written to ./fixtures/weather-recorded.json
```

### CLI Recording

```bash
# Record interactions with a local stdio server
mcp-server-mock --record \
  --record-target 'node ./real-server.js' \
  --record-output ./fixtures/recorded.json

# Record interactions with a remote HTTP server
mcp-server-mock --record \
  --record-url https://mcp.example.com/mcp \
  --record-output ./fixtures/recorded.json
```

In CLI recording mode, the mock server acts as a transparent proxy: it starts as a stdio server, forwards all client requests to the target server, and writes the fixture file on shutdown.

### Recorded Fixture Structure

The recorded fixture follows the same `FixtureFile` format described in Section 13. Tools, resources, and prompts are populated from the `tools/list`, `resources/list`, and `prompts/list` responses. Tool responses are populated from the captured `tools/call` responses. If the same tool is called multiple times with different arguments, only the last response is recorded in the fixture (earlier responses are overwritten). To capture all responses, use the `transformInteraction` callback.

### Redaction

Recording mode supports argument redaction to avoid persisting secrets or PII in fixture files:

```typescript
const mock = await MockMCPServer.record({
  target: { type: 'stdio', command: 'node', args: ['./server.js'] },
  outputPath: './fixtures/safe.json',
  redactArguments: true, // Replaces argument values with '<redacted>'
});
```

### Transform Interactions

The `transformInteraction` callback lets you modify or filter interactions before they are written:

```typescript
const mock = await MockMCPServer.record({
  target: { type: 'stdio', command: 'node', args: ['./server.js'] },
  outputPath: './fixtures/filtered.json',
  transformInteraction: (interaction) => {
    // Skip recording ping requests
    if (interaction.method === 'ping') return null;

    // Redact a specific field
    if (interaction.method === 'tools/call' && interaction.params.name === 'login') {
      interaction.params.arguments.password = '<redacted>';
    }
    return interaction;
  },
});
```

---

## 18. Testing Strategy

### Unit Tests

Unit tests verify the mock server's internal logic in isolation.

- **Handler registration tests**: Verify that `tool()`, `resource()`, and `prompt()` correctly register handlers and that `.returns()`, `.handler()`, `.throws()`, `.withDelay()`, `.timesOut()`, `.times()`, and `.inState()` modifiers apply correctly.
- **Response dispatch tests**: Verify that incoming requests are routed to the correct handler based on method and name. Verify fallback behavior when no handler is registered.
- **Error simulation tests**: Verify that `.throws()` produces correct JSON-RPC error responses with the right error code, message, and data fields.
- **Delay tests**: Verify that `.withDelay()` introduces the configured delay (measured with `Date.now()` tolerance of +/- 50ms). Verify that `.withJitter()` produces delays within the configured range.
- **Recording tests**: Verify that all requests are recorded with correct `seq`, `timestamp`, `method`, `params`, `id`, and `response` fields. Verify `resetRecordings()` clears the recording log.
- **Assertion tests**: Verify that `assertToolCalled()`, `assertToolCalledWith()`, `assertToolNotCalled()`, and other assertion methods pass when expectations are met and throw descriptive errors when they are not.
- **Scenario tests**: Verify that state machine transitions fire correctly, that state-dependent responses are returned, and that the current state is inspectable and settable.
- **Fixture loading tests**: Verify that valid fixtures are loaded correctly and that invalid fixtures produce descriptive validation errors.
- **Capability derivation tests**: Verify that the `initialize` response's `capabilities` field correctly reflects registered handlers.
- **Pagination tests**: Verify that list methods return paginated results when the number of items exceeds the page size, and that cursor-based pagination works correctly.

### Integration Tests

Integration tests connect a real MCP `Client` instance to the mock server and verify end-to-end behavior.

- **In-memory transport**: Client and mock server connected via `InMemoryTransport`. Full protocol lifecycle: initialize, list tools, call tools, read resources, get prompts, close.
- **Stdio transport**: Mock server running as subprocess via CLI with fixture file. Client connects via `StdioClientTransport`. Tests real JSON-RPC framing and subprocess lifecycle.
- **HTTP transport**: Mock server running via `listen()`. Client connects via `StreamableHTTPClientTransport`. Tests HTTP session management and SSE streaming.
- **Error handling**: Client receives JSON-RPC errors, transport errors, and timeouts from the mock. Verify client error handling code paths.
- **Notifications**: Mock server sends notifications. Verify that client receives and processes them correctly.
- **Scenarios**: Multi-step client workflows with state transitions. Verify that responses change as expected based on prior interactions.
- **Recording and replay**: Record interactions with a test server, save fixture, reload fixture, replay interactions, verify identical responses.

### Edge Cases to Test

- Mock server with zero handlers (only `initialize` and `ping` work).
- Mock server with handlers registered after `connect()`.
- Dynamic handler modification while client is connected (add/remove tools, verify `list_changed` notifications).
- Client sends requests before `initialized` notification when `enforceInitialization` is true.
- Multiple clients connecting to the same mock server (HTTP transport).
- `close()` called while a request is in progress.
- `close()` called while a `.timesOut()` handler is holding a request.
- Fixture file with invalid JSON (parse error).
- Fixture file with missing required fields (validation error).
- Recording mode with a target server that crashes mid-session.
- Recording mode with a target server that returns errors.
- Very large tool response content (megabytes of text).
- Very large number of tools (1000+) testing pagination.

### Test Framework

Tests use Vitest, matching the project's existing `package.json` configuration. Test files are colocated in `src/__tests__/`. Integration tests that spawn subprocesses use Vitest's `test.concurrent` for parallel execution where tests are independent.

---

## 19. Edge Cases and Failure Modes

### Client Sends Unknown Method

If a client sends a request with a method that the mock server does not handle (e.g., a method not in the MCP specification), the mock server returns `MockErrors.methodNotFound()` and records the request.

### Client Sends Malformed Request

If a client sends a JSON-RPC message with missing `method`, `id`, or `params` fields, the mock server returns `MockErrors.invalidRequest()` and records the malformed request.

### Handler Throws Unexpected Error

If a dynamic handler function throws an unhandled exception, the mock server catches it, returns `MockErrors.internalError(err.message)`, and records the error. The mock server continues operating; a single handler failure does not crash the server.

### Transport Closes Unexpectedly

If the transport closes while a request is in progress (e.g., client crashes), the mock server records the incomplete request and cleans up internal state. No error is thrown; the mock server is ready for a new connection.

### Fixture File Not Found

`loadFixtureFile()` throws with a descriptive message: `MockError: Fixture file not found: /path/to/file.json`.

### Fixture File Invalid JSON

`loadFixtureFile()` throws with a descriptive message: `MockError: Failed to parse fixture file /path/to/file.json: Unexpected token...`.

### Recording Target Unavailable

If recording mode cannot connect to the target server, `MockMCPServer.record()` rejects with a descriptive error: `MockError: Failed to connect to recording target: ECONNREFUSED`.

### Memory Growth

The recording log grows unboundedly during a test. For long-running tests with many requests, call `resetRecordings()` periodically or set a recording limit via `maxRecordedRequests` (default: 10,000; excess requests are recorded but oldest are dropped from the log).

---

## 20. Performance

### In-Memory Transport Overhead

In-memory transport has near-zero overhead: message passing is synchronous function calls within the same process. A tool call with a static response and no configured delay completes in under 1ms. This makes in-memory mocks suitable for large test suites with thousands of test cases.

### Delay Precision

Configured delays use `setTimeout`, which has platform-dependent precision. On Node.js, `setTimeout` precision is typically 1-5ms. A configured delay of 100ms may result in actual delays of 100-105ms. Tests that assert on timing should use tolerances of at least 20ms.

### HTTP Transport Overhead

The Streamable HTTP transport adds HTTP round-trip overhead (typically 1-5ms for localhost) plus JSON serialization/deserialization. Session management via `Mcp-Session-Id` headers adds minimal overhead. For tests that need raw speed, use in-memory transport instead.

### Recording Log Memory

Each recorded request consumes approximately 1-5KB of memory (depending on argument and response size). At 10,000 requests (the default limit), this is 10-50MB. For most test suites, this is negligible. If memory is a concern, reduce `maxRecordedRequests` or call `resetRecordings()` between tests.

### Startup Time

`MockMCPServer` constructor: <1ms. `createInMemoryTransports()`: <1ms. `connect()`: <5ms (protocol handshake). `listen()` (HTTP): 10-50ms (TCP listener allocation). Fixture loading from file: <10ms for typical fixtures (under 1MB). Total setup for a unit test: under 10ms.

### Concurrent Requests

The mock server processes requests sequentially in the order they are received. It does not support parallel request processing within a single connection. This matches the behavior of most MCP servers (especially stdio-based servers, which are inherently serial) and ensures deterministic test behavior. If parallel processing is needed for testing concurrent client behavior, use multiple mock server instances.

---

## 21. Dependencies

### Runtime Dependencies

| Dependency | Purpose | Why Not Avoid It |
|-----------|---------|-----------------|
| `@modelcontextprotocol/sdk` | Provides the `Server` class (or low-level protocol handler), `InMemoryTransport`, `StdioServerTransport`, `StreamableHTTPServerTransport`, and all MCP type definitions. | This is the official MCP SDK. The mock server must speak the MCP protocol correctly, including initialization, capability negotiation, JSON-RPC framing, pagination, and notification handling. Reimplementing these would be incorrect and fragile. Using the SDK ensures wire compatibility with any MCP client. |

### No Other Runtime Dependencies

The package does not depend on any HTTP framework, CLI parsing library, or utility library at runtime. CLI argument parsing is implemented with Node.js built-in `util.parseArgs` (Node.js 18+). The HTTP server for Streamable HTTP transport uses the built-in `node:http` module (via the SDK's `StreamableHTTPServerTransport`). JSON fixture file reading uses `node:fs/promises`. Timing uses `Date.now()`.

### Peer Dependencies

```json
{
  "peerDependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0"
  }
}
```

The SDK is a peer dependency because the test code that uses `mcp-server-mock` also uses SDK types (`Client`, `Transport`, content types). A single version of the SDK must be shared between the mock and the client under test to avoid type mismatches.

### Development Dependencies

| Dependency | Purpose |
|-----------|---------|
| `typescript` | TypeScript compiler. |
| `vitest` | Test runner. |
| `eslint` | Linter. |
| `@modelcontextprotocol/sdk` | Also a dev dependency for creating test clients in the mock server's own test suite. |

### Dependency Philosophy

Zero runtime dependencies beyond Node.js built-ins and the MCP SDK peer dependency. The package is a test utility, so it should be lightweight and fast to install. No lodash, no express, no cli framework -- just the protocol SDK and standard Node.js APIs.

---

## 22. File Structure

```
mcp-server-mock/
  package.json
  tsconfig.json
  SPEC.md
  README.md
  src/
    index.ts                  Main entry point. Exports MockMCPServer, MockErrors,
                              createMockSetup, and all types.
    mock-server.ts            MockMCPServer class implementation. Handler registration,
                              transport management, request dispatch, recording.
    handler-registry.ts       Registry for tool, resource, and prompt handlers.
                              Manages canned responses, dynamic handlers, delays, errors.
    tool-builder.ts           ToolBuilder fluent API implementation.
    resource-builder.ts       ResourceBuilder fluent API implementation.
    prompt-builder.ts         PromptBuilder fluent API implementation.
    request-recorder.ts       Records all incoming requests and notifications.
                              Provides filtering and query methods.
    assertions.ts             Assertion methods (assertToolCalled, etc.).
                              Throws descriptive errors on failure.
    scenario.ts               Scenario state machine. Manages states, transitions,
                              and state-dependent handler dispatch.
    fixture-loader.ts         Loads and validates fixture files. Converts fixture
                              definitions into handler registrations.
    fixture-validator.ts      Validates fixture file structure and field values.
    recording-proxy.ts        Recording mode implementation. Proxies to a real server,
                              captures interactions, serializes as fixture file.
    response-interceptor.ts   Response interception for malformed response simulation.
    mock-errors.ts            MockErrors factory (methodNotFound, invalidParams, etc.).
    transport-helpers.ts      Helpers for creating in-memory, stdio, and HTTP transports.
    cli.ts                    CLI entry point. Parses args, loads fixture, starts server.
    types.ts                  All TypeScript interfaces and type definitions.
  src/__tests__/
    mock-server.test.ts       Core mock server unit tests.
    handler-registry.test.ts  Handler registration and dispatch tests.
    tool-builder.test.ts      ToolBuilder fluent API tests.
    resource-builder.test.ts  ResourceBuilder fluent API tests.
    prompt-builder.test.ts    PromptBuilder fluent API tests.
    request-recorder.test.ts  Recording and query tests.
    assertions.test.ts        Assertion pass/fail tests.
    scenario.test.ts          State machine tests.
    fixture-loader.test.ts    Fixture loading and validation tests.
    recording-proxy.test.ts   Recording mode tests.
    mock-errors.test.ts       Error factory tests.
    integration.test.ts       End-to-end tests with real MCP Client
                              over in-memory transport.
    stdio-integration.test.ts End-to-end tests over stdio transport (subprocess).
    http-integration.test.ts  End-to-end tests over Streamable HTTP transport.
  bin/
    mcp-server-mock.js        CLI binary entry point.
```

---

## 23. Implementation Roadmap

### Phase 1: Core Mock Server (v0.1.0)

Deliver the minimum viable mock server for in-memory unit testing.

- `MockMCPServer` class with constructor accepting `MockServerOptions`.
- Tool handler registration: `.tool(name, definition).returns(response)` and `.handler(fn)`.
- Resource handler registration: `.resource(uri, definition).returns(response)` and `.handler(fn)`.
- Prompt handler registration: `.prompt(name, definition).returns(response)` and `.handler(fn)`.
- Automatic capability derivation from registered handlers.
- In-memory transport: `createInMemoryTransports()` and `connect()`.
- Full MCP lifecycle: `initialize` / `initialized` handshake, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `ping`.
- Request recording: all requests recorded with `seq`, `timestamp`, `method`, `params`, `id`, `response`.
- Basic assertions: `assertToolCalled()`, `assertToolCalledWith()`, `assertToolNotCalled()`, `assertRequestCount()`.
- `MockErrors` factory with standard JSON-RPC errors.
- Error simulation: `.throws()` on handlers.
- `close()` and `resetRecordings()` lifecycle methods.
- Full unit and integration test suite.
- README with basic usage examples.

### Phase 2: Delays, Scenarios, and Fixtures (v0.2.0)

Add time simulation, stateful testing, and declarative configuration.

- Delay injection: `.withDelay(ms)`, `.withJitter(min, max)`, `.timesOut()`, `defaultDelayMs`.
- Call count limiting: `.times(n)`.
- Scenario state machines: `.scenario()`, `.inState()`, `currentState`, `setState()`.
- Fixture file format definition and validation.
- Fixture loading: `loadFixture()`, `loadFixtureFile()`.
- Pagination for `tools/list`, `resources/list`, `prompts/list`.
- Server-initiated notifications: `notifyToolsChanged()`, `notifyResourcesChanged()`, `notifyResourceUpdated()`, `notifyPromptsChanged()`, `sendLogMessage()`, `sendProgress()`.
- Resource templates: `resourceTemplate()`.
- Completion handlers: `completion()`.
- `logging/setLevel` handler.
- `resources/subscribe` / `resources/unsubscribe` handlers.
- `createMockSetup()` helper function.

### Phase 3: CLI, Recording, and HTTP (v0.3.0)

Add CLI, recording mode, and HTTP transport support.

- CLI: `mcp-server-mock --fixture <path>` for stdio mode.
- CLI: `--http [port]` for Streamable HTTP mode.
- CLI: `--verbose`, `--delay`, `--strict`, `--page-size` options.
- `listen()` method for programmatic HTTP server.
- Recording mode: `MockMCPServer.record()` static method.
- Recording CLI: `--record`, `--record-target`, `--record-url`, `--record-output`.
- Response interceptors: `interceptResponse()` for malformed response simulation.
- Transport error simulation: `simulateTransportClose()`.
- `onInitialize()` and `onAfterInitialize()` hooks.
- Strict mode: duplicate ID rejection, param validation.
- Dynamic handler modification: `removeTool()`, `removeResource()`, `removePrompt()`.
- Stdio and HTTP integration tests.
- `bin/mcp-server-mock.js` binary.

### Phase 4: Polish and Ecosystem (v1.0.0)

Production-ready release with comprehensive documentation and edge case coverage.

- Full README with API reference and cookbook.
- Argument matching utilities (partial match, regex match, predicate match).
- `maxRecordedRequests` configuration.
- `setPageSize()` and `setStrictMode()` methods.
- Recording mode redaction and transform callbacks.
- Comprehensive edge case tests (large payloads, 1000+ tools, concurrent connections).
- Performance benchmarks.
- CHANGELOG.

---

## 24. Example Use Cases

### 24.1 Testing an Agent's Tool Selection Logic

An agent framework selects which tool to call based on the user's query. The test verifies that the agent calls the correct tool with the correct arguments.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MyAgent } from '../src/agent.js';

describe('Agent tool selection', () => {
  let mock: MockMCPServer;
  let client: Client;

  beforeEach(async () => {
    mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

    mock.tool('search_web', {
      description: 'Search the web for information',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    }).returns({
      content: [{ type: 'text', text: 'Search result: TypeScript is a typed superset of JavaScript.' }],
    });

    mock.tool('get_weather', {
      description: 'Get current weather for a city',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    }).returns({
      content: [{ type: 'text', text: '{"temp": 72, "condition": "sunny"}' }],
    });

    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);
    client = new Client({ name: 'agent', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await mock.close();
  });

  it('calls search_web for knowledge queries', async () => {
    const agent = new MyAgent(client);
    await agent.handleQuery('What is TypeScript?');

    mock.assertToolCalled('search_web', 1);
    mock.assertToolCalledWith('search_web', { query: 'TypeScript' });
    mock.assertToolNotCalled('get_weather');
  });

  it('calls get_weather for weather queries', async () => {
    const agent = new MyAgent(client);
    await agent.handleQuery('What is the weather in London?');

    mock.assertToolCalled('get_weather', 1);
    mock.assertToolCalledWith('get_weather', { city: 'London' });
    mock.assertToolNotCalled('search_web');
  });
});
```

### 24.2 Testing Client Error Handling

A client library wraps MCP calls and converts errors into application-specific exceptions. The test verifies correct error mapping.

```typescript
import { MockMCPServer, MockErrors } from 'mcp-server-mock';
import { MyMCPClient } from '../src/client.js';

describe('Error handling', () => {
  let mock: MockMCPServer;
  let myClient: MyMCPClient;

  beforeEach(async () => {
    mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

    mock.tool('working').returns({
      content: [{ type: 'text', text: 'OK' }],
    });

    mock.tool('broken').throws(
      MockErrors.internalError('Database connection refused'),
    );

    mock.tool('rate_limited').throws(
      MockErrors.custom(-32000, 'Rate limited', { retryAfter: 60 }),
    );

    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);
    myClient = new MyMCPClient(clientTransport);
    await myClient.connect();
  });

  afterEach(async () => {
    await myClient.disconnect();
    await mock.close();
  });

  it('returns data on success', async () => {
    const result = await myClient.callTool('working', {});
    expect(result).toBe('OK');
  });

  it('throws AppError on internal error', async () => {
    await expect(myClient.callTool('broken', {}))
      .rejects.toThrow('Database connection refused');
  });

  it('throws RateLimitError with retry info', async () => {
    try {
      await myClient.callTool('rate_limited', {});
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.retryAfter).toBe(60);
    }
  });
});
```

### 24.3 Testing Client Timeout Behavior

A client has a configurable timeout. The test verifies that the client correctly times out and retries.

```typescript
import { MockMCPServer } from 'mcp-server-mock';
import { MyMCPClient } from '../src/client.js';

describe('Timeout handling', () => {
  let mock: MockMCPServer;

  beforeEach(async () => {
    mock = new MockMCPServer({ name: 'test', version: '1.0.0' });

    // Tool that responds slowly
    mock.tool('slow_api').returns({
      content: [{ type: 'text', text: 'eventually' }],
    }).withDelay(5000);

    // Tool that never responds
    mock.tool('dead_api').timesOut();
  });

  afterEach(async () => {
    await mock.close();
  });

  it('times out and retries slow tools', async () => {
    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);

    const myClient = new MyMCPClient(clientTransport, { timeout: 1000, retries: 2 });
    await myClient.connect();

    await expect(myClient.callTool('slow_api', {})).rejects.toThrow('timeout');
    // Client should have attempted 3 times (1 original + 2 retries)
    mock.assertToolCalled('slow_api', 3);

    await myClient.disconnect();
  });
});
```

### 24.4 Testing Multi-Server Orchestration

A host application connects to multiple MCP servers and routes tool calls to the correct server. The test uses multiple mock servers with different tool sets.

```typescript
import { MockMCPServer } from 'mcp-server-mock';
import { MyMCPHost } from '../src/host.js';

describe('Multi-server routing', () => {
  let searchMock: MockMCPServer;
  let dbMock: MockMCPServer;

  beforeEach(async () => {
    searchMock = new MockMCPServer({ name: 'search-server', version: '1.0.0' });
    searchMock.tool('search').returns({
      content: [{ type: 'text', text: 'search result' }],
    });

    dbMock = new MockMCPServer({ name: 'db-server', version: '1.0.0' });
    dbMock.tool('query_db').returns({
      content: [{ type: 'text', text: '{"rows": []}' }],
    });
  });

  afterEach(async () => {
    await searchMock.close();
    await dbMock.close();
  });

  it('routes search calls to search server', async () => {
    const searchTransports = searchMock.createInMemoryTransports();
    const dbTransports = dbMock.createInMemoryTransports();

    await searchMock.connect(searchTransports.serverTransport);
    await dbMock.connect(dbTransports.serverTransport);

    const host = new MyMCPHost();
    await host.addServer('search', searchTransports.clientTransport);
    await host.addServer('db', dbTransports.clientTransport);

    await host.callTool('search', { query: 'test' });

    searchMock.assertToolCalled('search', 1);
    dbMock.assertNoRequests(); // db server should not receive any tool calls
  });
});
```

### 24.5 Testing Notification Handling

A client reacts to server notifications (e.g., re-fetching the tool list when `tools/list_changed` is received). The test verifies this reactive behavior.

```typescript
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Notification handling', () => {
  it('re-fetches tools on list_changed notification', async () => {
    const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
    mock.tool('original_tool').returns({
      content: [{ type: 'text', text: 'v1' }],
    });

    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);

    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientTransport);

    // Initial tool list
    const tools1 = await client.listTools();
    expect(tools1.tools).toHaveLength(1);

    // Add a new tool and notify
    mock.tool('new_tool').returns({
      content: [{ type: 'text', text: 'v2' }],
    });
    await mock.notifyToolsChanged();

    // Client should re-fetch (depends on client implementation)
    // For this test, we manually re-fetch to verify the mock server reflects the change
    const tools2 = await client.listTools();
    expect(tools2.tools).toHaveLength(2);
    expect(tools2.tools.map(t => t.name)).toContain('new_tool');

    await client.close();
    await mock.close();
  });
});
```

### 24.6 Testing with Fixture Files from Recording

Record interactions with a real server during development, then replay them in CI.

```bash
# During development, record interactions
npx mcp-server-mock --record \
  --record-target 'node ./real-weather-server.js' \
  --record-output ./test/fixtures/weather-recorded.json

# The recorded fixture is committed to version control
git add ./test/fixtures/weather-recorded.json
```

```typescript
// In CI, use the recorded fixture
import { MockMCPServer } from 'mcp-server-mock';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Weather client (recorded fixture)', () => {
  it('handles real server responses', async () => {
    const mock = new MockMCPServer({ name: 'test', version: '1.0.0' });
    await mock.loadFixtureFile('./test/fixtures/weather-recorded.json');

    const { clientTransport, serverTransport } = mock.createInMemoryTransports();
    await mock.connect(serverTransport);

    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'get_weather', arguments: { city: 'London' } });
    // Response matches what the real server returned during recording
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text).temperature).toBeDefined();

    await client.close();
    await mock.close();
  });
});
```

### 24.7 Testing Scenario-Based Workflows

An agent follows a multi-step workflow: authenticate, fetch data, process it, then clean up. The test verifies the full workflow using scenarios.

```typescript
import { MockMCPServer, createMockSetup } from 'mcp-server-mock';

describe('Multi-step workflow', () => {
  it('completes auth -> fetch -> process -> cleanup flow', async () => {
    const { mock, client, cleanup } = await createMockSetup({
      server: { name: 'workflow-server', version: '1.0.0' },
      tools: [
        {
          name: 'authenticate',
          inputSchema: { type: 'object', properties: { token: { type: 'string' } } },
          states: {
            'unauthenticated': { content: [{ type: 'text', text: 'Authenticated' }] },
            'authenticated': { content: [{ type: 'text', text: 'Already authenticated' }] },
          },
        },
        {
          name: 'fetch_data',
          states: {
            'unauthenticated': { content: [{ type: 'text', text: 'Unauthorized' }], isError: true },
            'authenticated': { content: [{ type: 'text', text: '{"data": [1,2,3]}' }] },
          },
        },
      ],
      scenario: {
        initialState: 'unauthenticated',
        transitions: [
          { from: 'unauthenticated', method: 'tools/call', match: { name: 'authenticate' }, to: 'authenticated' },
        ],
      },
    });

    // Before auth: fetch_data fails
    const r1 = await client.callTool({ name: 'fetch_data', arguments: {} });
    expect(r1.isError).toBe(true);

    // Authenticate
    const r2 = await client.callTool({ name: 'authenticate', arguments: { token: 'secret' } });
    expect(r2.content[0].text).toBe('Authenticated');

    // After auth: fetch_data succeeds
    const r3 = await client.callTool({ name: 'fetch_data', arguments: {} });
    expect(r3.isError).toBeUndefined();
    expect(JSON.parse(r3.content[0].text).data).toEqual([1, 2, 3]);

    await cleanup();
  });
});
```
