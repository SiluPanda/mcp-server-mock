# mcp-server-mock — Task Breakdown

This document tracks all implementation tasks derived from SPEC.md. Tasks are organized into phases matching the implementation roadmap (Section 23), with additional phases for testing, documentation, and publishing.

---

## Phase 0: Project Scaffolding and Setup

- [ ] **Install runtime dependency** — Add `@modelcontextprotocol/sdk` as a peer dependency (`^1.12.0`) and as a dev dependency for testing. | Status: not_done
- [ ] **Install dev dependencies** — Add `typescript`, `vitest`, and `eslint` as dev dependencies. Configure eslint for the project. | Status: not_done
- [ ] **Configure package.json bin entry** — Add `"bin": { "mcp-server-mock": "./bin/mcp-server-mock.js" }` to package.json for the CLI binary. | Status: not_done
- [ ] **Configure package.json exports** — Ensure `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`, and `"files": ["dist", "bin"]` are set correctly. | Status: not_done
- [ ] **Create source file structure** — Create all source files listed in Section 22: `src/index.ts`, `src/mock-server.ts`, `src/handler-registry.ts`, `src/tool-builder.ts`, `src/resource-builder.ts`, `src/prompt-builder.ts`, `src/request-recorder.ts`, `src/assertions.ts`, `src/scenario.ts`, `src/fixture-loader.ts`, `src/fixture-validator.ts`, `src/recording-proxy.ts`, `src/response-interceptor.ts`, `src/mock-errors.ts`, `src/transport-helpers.ts`, `src/cli.ts`, `src/types.ts`. | Status: not_done
- [ ] **Create test file structure** — Create all test files listed in Section 22 under `src/__tests__/`. | Status: not_done
- [ ] **Create bin directory and CLI entry point** — Create `bin/mcp-server-mock.js` with a shebang line that invokes the compiled CLI module. | Status: not_done
- [ ] **Verify TypeScript compilation** — Ensure `npm run build` succeeds with the empty/stub source files and the existing `tsconfig.json`. | Status: not_done

---

## Phase 1: Core Mock Server (v0.1.0)

### 1.1 Type Definitions (`src/types.ts`)

- [ ] **Define MockServerOptions interface** — Include `name`, `version`, `protocolVersion?`, `capabilities?`, `defaultDelayMs?`, `recordNotifications?`, `enforceInitialization?` fields with correct types and JSDoc comments as specified in Section 5. | Status: not_done
- [ ] **Define ServerCapabilities interface** — Include `tools?`, `resources?`, `prompts?`, `logging?`, `completions?` fields matching Section 5. | Status: not_done
- [ ] **Define ToolDefinition and ToolAnnotations interfaces** — Include `description?`, `inputSchema?`, `outputSchema?`, `annotations?` and all annotation hint fields. | Status: not_done
- [ ] **Define ToolContent union type** — Include `text`, `image`, `audio`, and `resource` content variants. | Status: not_done
- [ ] **Define ToolResponse interface** — Include `content`, `isError?`, `structuredContent?` fields. | Status: not_done
- [ ] **Define ToolHandlerFn type** — Function type accepting `(args, extra)` returning `ToolResponse | Promise<ToolResponse>`. | Status: not_done
- [ ] **Define ToolBuilder interface** — Include `returns()`, `handler()`, `throws()`, `withDelay()`, `withJitter()`, `timesOut()`, `times()`, `inState()` methods. | Status: not_done
- [ ] **Define ResourceDefinition interface** — Include `name`, `description?`, `mimeType?`, `size?` fields. | Status: not_done
- [ ] **Define ResourceContent and ResourceResponse interfaces** — `ResourceContent` with `uri`, `mimeType?`, `text?`, `blob?`; `ResourceResponse` with `contents` array. | Status: not_done
- [ ] **Define ResourceHandlerFn type** — Function type accepting `(uri, extra)` returning `ResourceResponse | Promise<ResourceResponse>`. | Status: not_done
- [ ] **Define ResourceBuilder interface** — Include `returns()`, `handler()`, `throws()`, `withDelay()`, `timesOut()`, `inState()` methods. | Status: not_done
- [ ] **Define ResourceTemplateDefinition interface** — Include `name`, `description?`, `uriTemplate`, `mimeType?` fields. | Status: not_done
- [ ] **Define PromptDefinition, PromptArgument, PromptMessage, PromptResponse interfaces** — All fields as specified in Section 5, including the PromptMessage content union type (`text`, `image`, `resource`). | Status: not_done
- [ ] **Define PromptHandlerFn type** — Function type accepting `(args, extra)` returning `PromptResponse | Promise<PromptResponse>`. | Status: not_done
- [ ] **Define PromptBuilder interface** — Include `returns()`, `handler()`, `throws()`, `withDelay()`, `inState()` methods. | Status: not_done
- [ ] **Define CompletionResponse interface** — Include `completion` with `values`, `total?`, `hasMore?`. | Status: not_done
- [ ] **Define CompletionHandlerFn type** — Function accepting `(ref, argument, extra)` returning `CompletionResponse | Promise<CompletionResponse>`. | Status: not_done
- [ ] **Define MockError interface** — Include `code`, `message`, `data?` fields. | Status: not_done
- [ ] **Define RecordedRequest interface** — Include `seq`, `timestamp`, `method`, `params`, `id`, `response` (with `result?`, `error?`, `durationMs`). | Status: not_done
- [ ] **Define RecordedNotification interface** — Include `seq`, `timestamp`, `method`, `params?`, `direction` (`'incoming' | 'outgoing'`). | Status: not_done
- [ ] **Define RequestExtra interface** — Include `state?` and `server` fields. | Status: not_done
- [ ] **Define ScenarioDefinition and ScenarioTransition interfaces** — `ScenarioDefinition` with `initialState` and `transitions`; `ScenarioTransition` with `from`, `method`, `match?`, `to`. Match can be `Record<string, unknown>` or predicate function. | Status: not_done
- [ ] **Define FixtureFile and related interfaces** — `FixtureFile`, `FixtureTool`, `FixtureResource`, `FixtureResourceTemplate`, `FixturePrompt` interfaces with all fields including `states` maps. | Status: not_done
- [ ] **Define RecordingOptions, RecordingTarget, RecordedInteraction interfaces** — All recording mode types as specified in Section 5. | Status: not_done

### 1.2 MockErrors Factory (`src/mock-errors.ts`)

- [ ] **Implement MockErrors.methodNotFound()** — Return `{ code: -32601, message }` with optional method name in message. | Status: not_done
- [ ] **Implement MockErrors.invalidParams()** — Return `{ code: -32602, message }` with optional detail message. | Status: not_done
- [ ] **Implement MockErrors.internalError()** — Return `{ code: -32603, message }` with optional detail message. | Status: not_done
- [ ] **Implement MockErrors.parseError()** — Return `{ code: -32700, message: 'Parse error' }`. | Status: not_done
- [ ] **Implement MockErrors.invalidRequest()** — Return `{ code: -32600, message }` with optional detail message. | Status: not_done
- [ ] **Implement MockErrors.custom()** — Return `{ code, message, data? }` with user-provided values. | Status: not_done

### 1.3 Tool Builder (`src/tool-builder.ts`)

- [ ] **Implement ToolBuilder class** — Create a class that implements the ToolBuilder interface with fluent method chaining (each method returns `this`). | Status: not_done
- [ ] **Implement .returns(response)** — Store a static ToolResponse to be returned on every call. | Status: not_done
- [ ] **Implement .handler(fn)** — Store a dynamic handler function that computes responses from arguments. | Status: not_done
- [ ] **Implement .throws(error)** — Store a MockError to be returned as a JSON-RPC error. | Status: not_done
- [ ] **Implement .withDelay(ms)** — Store a fixed delay in milliseconds to apply before responding. | Status: not_done
- [ ] **Implement .withJitter(minMs, maxMs)** — Store min/max range for random delay computation (`min + Math.random() * (max - min)`). | Status: not_done
- [ ] **Implement .timesOut()** — Set a flag indicating the handler should never resolve. | Status: not_done
- [ ] **Implement .times(n)** — Store a call count limit; after `n` calls, throw an exhaustion error. | Status: not_done
- [ ] **Implement .inState(stateName, response)** — Store state-dependent responses keyed by state name. | Status: not_done
- [ ] **Implement handler resolution logic** — When a tool is called, resolve the correct response: check state-dependent responses first, then static response, then dynamic handler, then error. Apply delay/jitter/timeout. Decrement call count if `.times()` is set. | Status: not_done

### 1.4 Resource Builder (`src/resource-builder.ts`)

- [ ] **Implement ResourceBuilder class** — Create a class implementing the ResourceBuilder interface with fluent method chaining. | Status: not_done
- [ ] **Implement .returns(response)** — Store a static ResourceResponse. | Status: not_done
- [ ] **Implement .handler(fn)** — Store a dynamic handler function. | Status: not_done
- [ ] **Implement .throws(error)** — Store a MockError for JSON-RPC error responses. | Status: not_done
- [ ] **Implement .withDelay(ms)** — Store a fixed delay. | Status: not_done
- [ ] **Implement .timesOut()** — Set a never-resolve flag. | Status: not_done
- [ ] **Implement .inState(stateName, response)** — Store state-dependent responses. | Status: not_done
- [ ] **Implement handler resolution logic** — Same resolution precedence as ToolBuilder, adapted for resources. | Status: not_done

### 1.5 Prompt Builder (`src/prompt-builder.ts`)

- [ ] **Implement PromptBuilder class** — Create a class implementing the PromptBuilder interface with fluent method chaining. | Status: not_done
- [ ] **Implement .returns(response)** — Store a static PromptResponse. | Status: not_done
- [ ] **Implement .handler(fn)** — Store a dynamic handler function. | Status: not_done
- [ ] **Implement .throws(error)** — Store a MockError. | Status: not_done
- [ ] **Implement .withDelay(ms)** — Store a fixed delay. | Status: not_done
- [ ] **Implement .inState(stateName, response)** — Store state-dependent responses. | Status: not_done
- [ ] **Implement handler resolution logic** — Same resolution precedence as ToolBuilder, adapted for prompts. | Status: not_done

### 1.6 Handler Registry (`src/handler-registry.ts`)

- [ ] **Implement HandlerRegistry class** — Manage internal maps for tool, resource, and prompt handlers keyed by name/URI. | Status: not_done
- [ ] **Implement tool registration** — Store ToolBuilder instances keyed by tool name. Prevent duplicate names (overwrite or error). | Status: not_done
- [ ] **Implement resource registration** — Store ResourceBuilder instances keyed by resource URI. | Status: not_done
- [ ] **Implement prompt registration** — Store PromptBuilder instances keyed by prompt name. | Status: not_done
- [ ] **Implement resource template registration** — Store ResourceTemplateDefinition objects. | Status: not_done
- [ ] **Implement completion handler registration** — Store a single CompletionHandlerFn. | Status: not_done
- [ ] **Implement handler lookup** — Given a method and params, resolve the correct handler (tool by name, resource by URI, prompt by name). | Status: not_done
- [ ] **Implement handler removal** — `removeTool(name)`, `removeResource(uri)`, `removePrompt(name)` methods that delete handlers from the registry. | Status: not_done
- [ ] **Implement registry enumeration** — Methods to list all registered tools (names + definitions), resources (URIs + definitions), prompts (names + definitions), and resource templates for use in `*/list` responses. | Status: not_done
- [ ] **Implement registry reset** — Clear all handlers for use in `resetAll()`. | Status: not_done

### 1.7 Request Recorder (`src/request-recorder.ts`)

- [ ] **Implement RequestRecorder class** — Maintain ordered arrays of `RecordedRequest` and `RecordedNotification` with auto-incrementing `seq` numbers. | Status: not_done
- [ ] **Implement request recording** — `recordRequest(method, params, id, response, durationMs)` that creates a `RecordedRequest` with ISO 8601 timestamp. | Status: not_done
- [ ] **Implement notification recording** — `recordNotification(method, params, direction)` that creates a `RecordedNotification`. | Status: not_done
- [ ] **Implement query methods** — `requestsFor(method)`, `toolCalls(toolName)`, `resourceReads(uri)`, `promptGets(promptName)` that filter the recording log. | Status: not_done
- [ ] **Implement reset** — `resetRecordings()` that clears both request and notification arrays and resets seq counter. | Status: not_done
- [ ] **Implement read-only accessors** — `get requests()` and `get notifications()` returning `ReadonlyArray`. | Status: not_done

### 1.8 Assertions (`src/assertions.ts`)

- [ ] **Implement assertToolCalled(toolName, times?)** — Check that the tool was called at least once (no times arg) or exactly N times. Throw descriptive error on failure including actual call details. | Status: not_done
- [ ] **Implement assertToolCalledWith(toolName, args)** — Check that the tool was called with arguments deeply equal to `args`. Throw descriptive error listing actual calls on failure. | Status: not_done
- [ ] **Implement assertToolNotCalled(toolName)** — Check that the tool was never called. Throw descriptive error listing actual calls on failure. | Status: not_done
- [ ] **Implement assertResourceRead(uri, times?)** — Check resource read count. | Status: not_done
- [ ] **Implement assertPromptRetrieved(promptName, times?)** — Check prompt retrieval count. | Status: not_done
- [ ] **Implement assertMethodCalled(method, times?)** — Check any method call count. | Status: not_done
- [ ] **Implement assertNoRequests()** — Check that zero requests were recorded (excluding initialize/initialized). | Status: not_done
- [ ] **Implement assertRequestCount(count)** — Check total request count. | Status: not_done
- [ ] **Implement descriptive error messages** — All assertion errors must include actual call details (arguments, timestamps, responses) as specified in Section 10. | Status: not_done

### 1.9 Transport Helpers (`src/transport-helpers.ts`)

- [ ] **Implement createInMemoryTransports()** — Call `InMemoryTransport.createLinkedPair()` from the SDK and return `{ clientTransport, serverTransport }`. | Status: not_done

### 1.10 MockMCPServer Core (`src/mock-server.ts`)

- [ ] **Implement MockMCPServer constructor** — Accept `MockServerOptions`, initialize internal state (HandlerRegistry, RequestRecorder, scenario state), apply defaults for optional fields. | Status: not_done
- [ ] **Implement automatic capability derivation** — Derive `ServerCapabilities` from registered handlers: include `tools` if any tools registered, `resources` if any resources registered (with `subscribe` if subscription handlers exist), `prompts` if any prompts registered, `logging` always, `completions` if completion handler registered. Allow override via `options.capabilities`. | Status: not_done
- [ ] **Implement tool() method** — Accept `(name, definition?)`, create a ToolBuilder, register it in the HandlerRegistry, return the ToolBuilder for fluent chaining. | Status: not_done
- [ ] **Implement resource() method** — Accept `(uri, definition?)`, create a ResourceBuilder, register it, return the ResourceBuilder. | Status: not_done
- [ ] **Implement prompt() method** — Accept `(name, definition?)`, create a PromptBuilder, register it, return the PromptBuilder. | Status: not_done
- [ ] **Implement resourceTemplate() method** — Accept `ResourceTemplateDefinition`, register it in the HandlerRegistry. | Status: not_done
- [ ] **Implement completion() method** — Accept `CompletionHandlerFn`, register it in the HandlerRegistry. | Status: not_done
- [ ] **Implement createInMemoryTransports()** — Delegate to transport-helpers, return the transport pair. | Status: not_done
- [ ] **Implement connect(transport)** — Use the SDK's `Server` class (or low-level protocol handler) to connect to the given transport. Set up request dispatch, recording, and lifecycle management. | Status: not_done
- [ ] **Implement initialize handler** — Handle the `initialize` request: return `protocolVersion`, `capabilities` (derived or overridden), and `serverInfo` (`name`, `version`). Track lifecycle state. | Status: not_done
- [ ] **Implement initialized notification handler** — Handle the `notifications/initialized` notification. Mark the session as fully initialized. | Status: not_done
- [ ] **Implement enforceInitialization** — When `enforceInitialization` is true, reject operation requests (tools/call, resources/read, etc.) received before the initialization handshake is complete with an appropriate error. | Status: not_done
- [ ] **Implement ping handler** — Handle `ping` requests by returning an empty result `{}`. | Status: not_done
- [ ] **Implement tools/list handler** — Return all registered tools with their names, descriptions, input schemas, output schemas, and annotations. | Status: not_done
- [ ] **Implement tools/call handler** — Dispatch to the registered ToolBuilder by tool name. Apply delay, resolve response (static/dynamic/error/state-dependent), record the request, return the response. Handle missing tool with `methodNotFound`. | Status: not_done
- [ ] **Implement resources/list handler** — Return all registered resources with their URIs, names, descriptions, and MIME types. | Status: not_done
- [ ] **Implement resources/read handler** — Dispatch to the registered ResourceBuilder by URI. Apply delay, resolve response, record the request, return the response. | Status: not_done
- [ ] **Implement prompts/list handler** — Return all registered prompts with their names, descriptions, and arguments. | Status: not_done
- [ ] **Implement prompts/get handler** — Dispatch to the registered PromptBuilder by name. Apply delay, resolve response, record the request, return the response. | Status: not_done
- [ ] **Implement request recording integration** — Record every incoming request (method, params, id) and its response (result/error, durationMs) via the RequestRecorder. | Status: not_done
- [ ] **Implement notification recording** — Record incoming client notifications (`notifications/initialized`, `notifications/cancelled`, `notifications/roots/list_changed`) via the RequestRecorder. | Status: not_done
- [ ] **Implement close()** — Close the transport connection, clean up internal state, finalize recordings. For HTTP mode, stop the HTTP server. | Status: not_done
- [ ] **Implement resetRecordings()** — Delegate to RequestRecorder.resetRecordings(). Keep handlers intact. | Status: not_done
- [ ] **Implement resetAll()** — Reset handlers, recordings, and scenario state. Return server to initial state. | Status: not_done
- [ ] **Implement assertion method delegation** — Expose `assertToolCalled()`, `assertToolCalledWith()`, `assertToolNotCalled()`, `assertResourceRead()`, `assertPromptRetrieved()`, `assertMethodCalled()`, `assertNoRequests()`, `assertRequestCount()` by delegating to the assertions module with the recorder's data. | Status: not_done
- [ ] **Implement request/notification accessors** — Expose `get requests()`, `get notifications()`, `requestsFor()`, `toolCalls()`, `resourceReads()`, `promptGets()` by delegating to the RequestRecorder. | Status: not_done
- [ ] **Handle unknown methods** — Return `MockErrors.methodNotFound()` for any request method not handled by the mock server. Record the request. | Status: not_done
- [ ] **Handle handler exceptions** — Catch unhandled exceptions from dynamic handler functions, return `MockErrors.internalError(err.message)`, record the error. Do not crash the server. | Status: not_done

### 1.11 Main Entry Point (`src/index.ts`)

- [ ] **Export MockMCPServer class** — Re-export from `mock-server.ts`. | Status: not_done
- [ ] **Export MockErrors** — Re-export from `mock-errors.ts`. | Status: not_done
- [ ] **Export all type interfaces** — Re-export all public types from `types.ts`. | Status: not_done

---

## Phase 1 Tests

- [ ] **Write mock-errors.test.ts** — Test all MockErrors factory methods: verify correct error codes, messages, custom data. Test edge cases (empty messages, negative codes). | Status: not_done
- [ ] **Write tool-builder.test.ts** — Test ToolBuilder fluent API: `.returns()` stores response, `.handler()` stores function, `.throws()` stores error, `.withDelay()` stores delay, `.withJitter()` stores range, `.timesOut()` sets flag, `.times()` sets limit, `.inState()` stores state responses. Test handler resolution precedence and exhaustion behavior. | Status: not_done
- [ ] **Write resource-builder.test.ts** — Test ResourceBuilder fluent API analogous to tool-builder tests. | Status: not_done
- [ ] **Write prompt-builder.test.ts** — Test PromptBuilder fluent API analogous to tool-builder tests. | Status: not_done
- [ ] **Write handler-registry.test.ts** — Test handler registration, lookup, removal, enumeration, and reset for tools, resources, prompts, templates, and completions. | Status: not_done
- [ ] **Write request-recorder.test.ts** — Test request and notification recording, query/filter methods, reset, seq auto-increment, timestamp generation. | Status: not_done
- [ ] **Write assertions.test.ts** — Test all assertion methods: passing cases (no throw), failing cases (descriptive error messages). Test edge cases (zero calls, exact count matching, argument deep equality). | Status: not_done
- [ ] **Write mock-server.test.ts (unit)** — Test MockMCPServer constructor defaults, capability derivation from handlers, handler registration methods, lifecycle methods (resetRecordings, resetAll). | Status: not_done
- [ ] **Write integration.test.ts (in-memory)** — Full end-to-end test: create MockMCPServer, register tools/resources/prompts, connect via in-memory transport, connect a real MCP Client, exercise initialize/tools/list/tools/call/resources/list/resources/read/prompts/list/prompts/get/ping, verify responses and recordings, close both. | Status: not_done
- [ ] **Test: zero handlers** — Verify mock server with no handlers only supports `initialize` and `ping`. `tools/list` returns empty array. Other calls return method not found. | Status: not_done
- [ ] **Test: error simulation end-to-end** — Register tool with `.throws()`, call it via client, verify client receives JSON-RPC error with correct code/message/data. | Status: not_done
- [ ] **Test: dynamic handler end-to-end** — Register tool with `.handler()`, call it with different arguments, verify computed responses. | Status: not_done
- [ ] **Test: capability derivation** — Register only tools, verify `initialize` response has `tools` capability but not `resources` or `prompts`. Then register resources, verify capabilities update. | Status: not_done

---

## Phase 2: Delays, Scenarios, and Fixtures (v0.2.0)

### 2.1 Delay and Latency Simulation

- [ ] **Implement global defaultDelayMs** — Apply `options.defaultDelayMs` to all handlers that do not have a per-handler delay override. | Status: not_done
- [ ] **Implement per-handler fixed delay** — When `.withDelay(ms)` is set on a handler, introduce `setTimeout` delay before returning the response. Override global delay. | Status: not_done
- [ ] **Implement per-handler jitter delay** — When `.withJitter(min, max)` is set, compute random delay as `min + Math.random() * (max - min)` for each call. | Status: not_done
- [ ] **Implement timeout simulation** — When `.timesOut()` is set, return a never-resolving promise. The handler holds the request open indefinitely. | Status: not_done
- [ ] **Implement call count limiting** — When `.times(n)` is set, track call count. After `n` successful calls, throw `MockErrors.custom(-32000, 'Handler exhausted after N calls')`. | Status: not_done
- [ ] **Implement delay on resources** — Apply `.withDelay()` and `.timesOut()` to ResourceBuilder handlers. | Status: not_done
- [ ] **Implement delay on prompts** — Apply `.withDelay()` and `.withJitter()` to PromptBuilder handlers. | Status: not_done

### 2.2 Scenario State Machine (`src/scenario.ts`)

- [ ] **Implement ScenarioManager class** — Manage current state, transition rules, and state queries. | Status: not_done
- [ ] **Implement scenario() configuration** — Accept a `ScenarioDefinition`, store initial state and transition rules. Set current state to `initialState`. | Status: not_done
- [ ] **Implement transition matching** — On each incoming request, check if any transition matches the current state and the request's method/params. Support three match types: no match field (method-only), object match (shallow partial match on params), function match (predicate). | Status: not_done
- [ ] **Implement state transitions** — When a matching transition is found, update current state to `to` before resolving the handler. | Status: not_done
- [ ] **Implement state-dependent response dispatch** — When resolving a handler, check for `.inState()` response matching current state. Fall back to non-state response if no state-specific response exists. Throw `MockErrors.internalError('No handler for tool "X" in state "Y"')` if neither exists. | Status: not_done
- [ ] **Implement currentState getter** — Return the current scenario state, or `undefined` if no scenario is configured. | Status: not_done
- [ ] **Implement setState(stateName)** — Allow manual state setting for test setup. | Status: not_done
- [ ] **Pass state via RequestExtra** — Include current state in the `RequestExtra.state` field passed to dynamic handlers. | Status: not_done

### 2.3 Fixture Loading (`src/fixture-loader.ts`, `src/fixture-validator.ts`)

- [ ] **Implement FixtureValidator** — Validate fixture file structure: required fields (`server.name`, `server.version`), unique tool/resource/prompt names, valid input schemas (structural check), state name consistency with scenario transitions, error object structure (`code` + `message`), response structure correctness. Throw descriptive validation errors. | Status: not_done
- [ ] **Implement loadFixture(fixture)** — Accept a `FixtureFile` object, validate it, then register all tools, resources, resource templates, prompts, and scenario from the fixture data. Map fixture tool responses to `.returns()`, errors to `.throws()`, delays to `.withDelay()`, and state maps to `.inState()`. | Status: not_done
- [ ] **Implement loadFixtureFile(filePath)** — Read a JSON file from disk using `node:fs/promises`, parse it, handle file-not-found (`MockError: Fixture file not found: <path>`), handle invalid JSON (`MockError: Failed to parse fixture file <path>: <error>`), then delegate to `loadFixture()`. | Status: not_done
- [ ] **Implement fixture-to-handler mapping for tools** — For each `FixtureTool`: register via `tool(name, definition)`, apply `.returns()` if `response` is set, `.throws()` if `error` is set, `.withDelay()` if `delayMs` is set, `.inState()` for each entry in `states`. | Status: not_done
- [ ] **Implement fixture-to-handler mapping for resources** — For each `FixtureResource`: register via `resource(uri, definition)`, apply `.returns()`, `.throws()`, `.withDelay()`, `.inState()` as applicable. | Status: not_done
- [ ] **Implement fixture-to-handler mapping for prompts** — For each `FixturePrompt`: register via `prompt(name, definition)`, apply `.returns()`, `.throws()`, `.withDelay()`, `.inState()` as applicable. | Status: not_done
- [ ] **Implement fixture-to-handler mapping for resource templates** — For each `FixtureResourceTemplate`: register via `resourceTemplate(definition)`. | Status: not_done
- [ ] **Implement fixture scenario loading** — If `fixture.scenario` is defined, call `scenario(fixture.scenario)` to configure the state machine. | Status: not_done

### 2.4 Server-Initiated Notifications

- [ ] **Implement sendNotification(method, params?)** — Send an arbitrary notification from the server to the client via the transport. Record it as an outgoing notification. | Status: not_done
- [ ] **Implement notifyToolsChanged()** — Send `notifications/tools/list_changed` notification. | Status: not_done
- [ ] **Implement notifyResourcesChanged()** — Send `notifications/resources/list_changed` notification. | Status: not_done
- [ ] **Implement notifyResourceUpdated(uri)** — Send `notifications/resources/updated` with the resource URI. | Status: not_done
- [ ] **Implement notifyPromptsChanged()** — Send `notifications/prompts/list_changed` notification. | Status: not_done
- [ ] **Implement sendProgress(progressToken, progress, total?, message?)** — Send `notifications/progress` with progress details. | Status: not_done
- [ ] **Implement sendLogMessage(level, data, logger?)** — Send `notifications/message` with log level, data, and optional logger name. | Status: not_done

### 2.5 Additional Protocol Handlers

- [ ] **Implement resources/templates/list handler** — Return all registered resource templates. | Status: not_done
- [ ] **Implement resources/subscribe handler** — Accept subscription requests, track subscribed URIs. | Status: not_done
- [ ] **Implement resources/unsubscribe handler** — Remove URI subscriptions. | Status: not_done
- [ ] **Implement completion/complete handler** — Dispatch to the registered CompletionHandlerFn. Return `CompletionResponse`. | Status: not_done
- [ ] **Implement logging/setLevel handler** — Accept log level changes, track current log level internally. | Status: not_done
- [ ] **Implement pagination for tools/list** — When registered tools exceed page size, return paginated results with cursor. Support `cursor` param for subsequent pages. Default page size: 50. | Status: not_done
- [ ] **Implement pagination for resources/list** — Same pagination logic as tools/list for resources. | Status: not_done
- [ ] **Implement pagination for prompts/list** — Same pagination logic as tools/list for prompts. | Status: not_done
- [ ] **Implement setPageSize(n)** — Allow overriding the default page size (50). | Status: not_done

### 2.6 Convenience Helper

- [ ] **Implement createMockSetup()** — Accept an inline fixture-like configuration object, create a MockMCPServer, register handlers, create in-memory transports, connect both server and a real Client, return `{ mock, client, cleanup }` where `cleanup()` closes both. Export from index.ts. | Status: not_done

---

## Phase 2 Tests

- [ ] **Write delay simulation tests** — Test `.withDelay()` introduces delay (measure with `Date.now()`, tolerance +-50ms). Test `.withJitter()` produces delays in range. Test `.timesOut()` causes request to hang (use AbortSignal or timeout). Test `defaultDelayMs` applies globally. Test per-handler delay overrides global delay. | Status: not_done
- [ ] **Write .times() exhaustion tests** — Test `.times(2)` returns response twice then throws. Verify exhaustion error message. | Status: not_done
- [ ] **Write scenario.test.ts** — Test scenario state machine: initial state, transitions on matching requests, state-dependent responses, predicate match functions, object match, no-match method-only transitions, manual setState(), currentState getter, fallback behavior when no state-specific handler exists. | Status: not_done
- [ ] **Write fixture-loader.test.ts** — Test loading valid fixtures: tools, resources, prompts, templates, scenarios all correctly registered. Test loading fixtures from file. Test validation errors: missing server.name, duplicate tool names, invalid error objects, mismatched state names, invalid response structures. Test file-not-found error. Test invalid JSON error. | Status: not_done
- [ ] **Write notification tests** — Test that `notifyToolsChanged()`, `notifyResourcesChanged()`, `notifyResourceUpdated()`, `notifyPromptsChanged()`, `sendLogMessage()`, `sendProgress()` send correct notifications to the client. Verify notifications are recorded. | Status: not_done
- [ ] **Write pagination tests** — Register 100+ tools, verify `tools/list` returns paginated results with cursor. Verify iterating through all pages returns all tools. Test custom page size via `setPageSize()`. | Status: not_done
- [ ] **Write subscription handler tests** — Test `resources/subscribe` and `resources/unsubscribe` handlers. | Status: not_done
- [ ] **Write completion handler tests** — Register a completion handler, call `completion/complete`, verify response. | Status: not_done
- [ ] **Write logging/setLevel handler tests** — Call `logging/setLevel`, verify level is tracked internally. | Status: not_done
- [ ] **Write createMockSetup() tests** — Test convenience helper creates a working mock+client pair, test cleanup closes both. | Status: not_done
- [ ] **Write scenario integration test** — Full end-to-end: configure scenario with multiple states, connect client, exercise multi-step workflow, verify state transitions and state-dependent responses. | Status: not_done

---

## Phase 3: CLI, Recording, and HTTP (v0.3.0)

### 3.1 Response Interceptors (`src/response-interceptor.ts`)

- [ ] **Implement interceptResponse(method, fn)** — Register a function that intercepts and modifies responses for a given method before they are sent to the client. Support modifying/deleting fields for malformed response simulation. | Status: not_done
- [ ] **Integrate interceptors into response pipeline** — After a handler produces a response, apply any matching interceptor before sending to the client. | Status: not_done

### 3.2 Transport Error Simulation

- [ ] **Implement simulateTransportClose()** — Forcibly close the transport connection mid-session. Useful for testing client behavior when the server crashes. | Status: not_done
- [ ] **Implement onInitialize(fn) hook** — Allow overriding the default initialization handler for testing handshake failures. | Status: not_done
- [ ] **Implement onAfterInitialize(fn) hook** — Register a callback that runs after successful initialization, useful for post-init actions like delayed transport close. | Status: not_done

### 3.3 Advanced Configuration

- [ ] **Implement setStrictMode(flag)** — Enable strict protocol enforcement: reject duplicate request IDs with `InvalidRequest` error, validate param structures. | Status: not_done
- [ ] **Implement duplicate request ID tracking** — In strict mode, track all seen request IDs and reject duplicates. | Status: not_done
- [ ] **Implement dynamic handler modification** — Expose `removeTool(name)`, `removeResource(uri)`, `removePrompt(name)` on MockMCPServer, delegating to HandlerRegistry. | Status: not_done

### 3.4 Streamable HTTP Transport

- [ ] **Implement listen(port?) method** — Start an HTTP server using the SDK's `StreamableHTTPServerTransport` on the given port (default: port 0 for OS-assigned). Return `{ url, close }`. Handle session management via `Mcp-Session-Id` headers. | Status: not_done
- [ ] **Implement HTTP session lifecycle** — Support HTTP DELETE for session termination. Handle multiple requests within a session. | Status: not_done

### 3.5 CLI (`src/cli.ts`, `bin/mcp-server-mock.js`)

- [ ] **Implement CLI argument parsing** — Use `node:util.parseArgs` to parse all CLI flags: `--fixture`, `--stdio`, `--http`, `--delay`, `--strict`, `--page-size`, `--verbose`, `--silent`, `--record`, `--record-target`, `--record-url`, `--record-output`, `--version`, `--help`. | Status: not_done
- [ ] **Implement --help output** — Print formatted usage information matching Section 16. | Status: not_done
- [ ] **Implement --version output** — Read version from package.json and print it. | Status: not_done
- [ ] **Implement --fixture loading** — Load the specified fixture file path, create a MockMCPServer, register handlers from the fixture. Error on missing/invalid fixture with exit code 1. | Status: not_done
- [ ] **Implement stdio transport mode (default)** — When `--stdio` (or no transport flag), connect the mock server to stdin/stdout using the SDK's `StdioServerTransport`. | Status: not_done
- [ ] **Implement HTTP transport mode** — When `--http [port]`, call `mock.listen(port)` to start the HTTP server. Default port: 3000. | Status: not_done
- [ ] **Implement --delay flag** — Override the fixture's `defaultDelayMs` with the CLI-provided value. | Status: not_done
- [ ] **Implement --strict flag** — Call `mock.setStrictMode(true)`. | Status: not_done
- [ ] **Implement --page-size flag** — Call `mock.setPageSize(n)`. | Status: not_done
- [ ] **Implement --verbose flag** — Log all requests and responses to stderr with timestamps. | Status: not_done
- [ ] **Implement --silent flag** — Suppress all stderr output. | Status: not_done
- [ ] **Implement graceful shutdown** — Handle SIGTERM and SIGINT signals. Close the mock server cleanly. Exit with code 0. | Status: not_done
- [ ] **Implement exit codes** — Exit 0 on clean shutdown, 1 on fixture/startup errors, 2 on configuration errors (invalid flags, missing required options). | Status: not_done
- [ ] **Implement bin/mcp-server-mock.js** — Create the bin entry point with `#!/usr/bin/env node` shebang that requires the compiled CLI module. | Status: not_done

### 3.6 Recording Mode (`src/recording-proxy.ts`)

- [ ] **Implement MockMCPServer.record() static method** — Accept `RecordingOptions`, connect to the target server (stdio or HTTP), create a proxy mock server that forwards requests and captures responses. | Status: not_done
- [ ] **Implement stdio recording target** — Spawn the target command as a subprocess, connect to it via `StdioClientTransport`, forward all client requests to the target. | Status: not_done
- [ ] **Implement HTTP recording target** — Connect to the target URL via `StreamableHTTPClientTransport`, forward all client requests. | Status: not_done
- [ ] **Implement interaction capture** — Capture every request-response pair as a `RecordedInteraction` (method, params, result/error, durationMs). | Status: not_done
- [ ] **Implement fixture generation on close** — When the recording session ends, convert captured interactions into a `FixtureFile` structure. Populate tools from `tools/list` response, resources from `resources/list`, prompts from `prompts/list`. Map tool call responses to fixture tool entries. Write to `outputPath` as JSON. | Status: not_done
- [ ] **Implement redactArguments option** — When `redactArguments: true`, replace all argument values in recorded fixtures with `'<redacted>'`. | Status: not_done
- [ ] **Implement transformInteraction callback** — Apply the user-provided transform function to each interaction before saving. If transform returns `null`, skip the interaction. | Status: not_done
- [ ] **Implement CLI recording mode** — When `--record` is specified, use `--record-target` (stdio command) or `--record-url` (HTTP URL) and `--record-output` (output path). Start recording proxy. Write fixture on shutdown. | Status: not_done
- [ ] **Handle recording target unavailable** — If the target server cannot be reached, reject with `MockError: Failed to connect to recording target: <error>`. | Status: not_done
- [ ] **Handle recording target crash** — If the target server crashes mid-session, finalize whatever interactions have been captured and write the partial fixture. | Status: not_done

---

## Phase 3 Tests

- [ ] **Write response-interceptor tests** — Test `interceptResponse()` modifies responses before sending. Test removing fields for malformed response simulation. Test multiple interceptors for different methods. | Status: not_done
- [ ] **Write transport error simulation tests** — Test `simulateTransportClose()` closes the connection. Test `onInitialize()` override for handshake failures. Test `onAfterInitialize()` callback execution. | Status: not_done
- [ ] **Write strict mode tests** — Test that `setStrictMode(true)` rejects duplicate request IDs. Test param validation in strict mode. | Status: not_done
- [ ] **Write dynamic handler modification tests** — Test `removeTool()`, `removeResource()`, `removePrompt()` remove handlers. Verify subsequent `*/list` calls reflect removal. Verify removed handler calls return method not found. | Status: not_done
- [ ] **Write http-integration.test.ts** — End-to-end test: start mock server via `listen()`, connect client via `StreamableHTTPClientTransport`, exercise full protocol lifecycle, close both. Test session management. | Status: not_done
- [ ] **Write stdio-integration.test.ts** — End-to-end test: spawn mock server CLI as subprocess with fixture file, connect client via `StdioClientTransport`, exercise full protocol lifecycle, close both. Test exit codes. | Status: not_done
- [ ] **Write CLI argument parsing tests** — Test all flag combinations: `--fixture`, `--http`, `--delay`, `--strict`, `--page-size`, `--verbose`, `--silent`. Test error cases: missing `--fixture`, invalid port, conflicting flags. | Status: not_done
- [ ] **Write recording-proxy.test.ts** — Test recording mode: set up a simple real server, record interactions through the proxy, verify the generated fixture file contains correct tools, resources, and responses. Test redaction. Test transform callback. Test target unavailable error. | Status: not_done
- [ ] **Write recording and replay test** — Record interactions with a test server, save fixture, create a new mock server from the saved fixture, replay the same interactions, verify identical responses. | Status: not_done

---

## Phase 4: Polish and Ecosystem (v1.0.0)

### 4.1 Advanced Features

- [ ] **Implement maxRecordedRequests configuration** — Add option to limit the recording log size. Default: 10,000. When exceeded, drop oldest entries. | Status: not_done
- [ ] **Implement listChanged capability flags** — When notification simulation is enabled, include `listChanged: true` in the appropriate capability objects (tools, resources, prompts). | Status: not_done
- [ ] **Handle handlers registered after connect()** — Ensure tools/resources/prompts registered after `connect()` are included in subsequent `*/list` responses. Capabilities should reflect the current handler state. | Status: not_done
- [ ] **Handle close() during in-progress request** — When `close()` is called while a handler is processing, cleanly abort and finalize the recording. | Status: not_done
- [ ] **Handle close() during timesOut() handler** — When `close()` is called while a `.timesOut()` handler is holding a request, cleanly release the held request. | Status: not_done
- [ ] **Handle transport close during request** — If the transport closes unexpectedly mid-request, record the incomplete request and clean up without throwing. | Status: not_done

### 4.2 Edge Case Handling

- [ ] **Test very large tool response content** — Verify the mock server handles megabyte-sized text responses without issues. | Status: not_done
- [ ] **Test very large number of tools (1000+)** — Register 1000+ tools, verify pagination works correctly across all pages. | Status: not_done
- [ ] **Test out-of-order responses** — Register two tools with different delays, verify client receives responses correlated by ID even when they arrive out of order. | Status: not_done
- [ ] **Test pre-handshake request rejection** — With `enforceInitialization: true`, send a `tools/list` request before `initialize`. Verify it is rejected. | Status: not_done
- [ ] **Test fixture file with invalid JSON** — Verify descriptive parse error message. | Status: not_done
- [ ] **Test fixture file with missing required fields** — Verify descriptive validation error message. | Status: not_done
- [ ] **Test version mismatch handling** — Create mock with old protocol version, verify client receives it in initialize response. | Status: not_done
- [ ] **Test capability negotiation failure** — Create mock with explicitly `undefined` tools capability, verify `tools/list` returns method not found. | Status: not_done
- [ ] **Test multiple clients on HTTP transport** — Verify HTTP transport handles concurrent client sessions correctly. | Status: not_done

---

## Documentation

- [ ] **Write README.md** — Include: overview, installation, quick start, API reference for MockMCPServer (constructor, tool/resource/prompt registration, transport methods, lifecycle, assertions, scenarios, fixtures, recording), MockErrors reference, CLI usage, examples (basic stubbing, error simulation, delay/timeout, scenarios, fixtures, recording, test framework integration with Vitest/Jest/Mocha), peer dependency note, license. | Status: not_done
- [ ] **Add JSDoc comments to all public APIs** — Add comprehensive JSDoc to MockMCPServer class, all builder classes, MockErrors, createMockSetup, and all exported types. | Status: not_done
- [ ] **Create example fixture files** — Create `examples/weather-server.json` and `examples/stateful-api.json` fixture files matching the spec examples for users to reference. | Status: not_done

---

## CI/CD and Publishing

- [ ] **Verify npm run build succeeds** — Ensure `tsc` compiles all source files without errors. | Status: not_done
- [ ] **Verify npm run lint passes** — Ensure eslint reports no errors on all source files. | Status: not_done
- [ ] **Verify npm run test passes** — Ensure all Vitest tests pass. | Status: not_done
- [ ] **Bump version to 0.1.0** — Set version in package.json for Phase 1 release (already set). | Status: not_done
- [ ] **Verify package.json metadata** — Ensure `name`, `description`, `keywords`, `author`, `license`, `engines`, `publishConfig`, `peerDependencies` are all correctly configured. Add relevant keywords (e.g., `mcp`, `mock`, `testing`, `model-context-protocol`). | Status: not_done
- [ ] **Test npm pack** — Run `npm pack` and verify the package includes only `dist/` and `bin/` directories. Verify no test files, source maps, or unnecessary files are included. | Status: not_done
- [ ] **Publish to npm** — Follow the monorepo workflow: merge PR, checkout master, `npm publish`. | Status: not_done
