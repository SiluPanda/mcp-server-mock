import type {
  MockServerOptions,
  ToolDefinition,
  ToolResponse,
  ResourceDefinition,
  ResourceResponse,
  ResourceTemplateDefinition,
  PromptDefinition,
  PromptResponse,
  CompletionHandlerFn,
  MockError,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  RecordedRequest,
  RecordedNotification,
  ScenarioDefinition,
  RequestExtra,
  FixtureFile,
} from './types.js';
import { HandlerRegistry, executeHandler } from './registry.js';
import { RequestRecorder } from './recorder.js';
import { ScenarioManager } from './scenario.js';
import { AssertionHelper } from './assertions.js';
import { ToolBuilder, ResourceBuilder, PromptBuilder } from './builder.js';
import { MockErrors } from './errors.js';

/**
 * Programmable mock MCP server for integration testing.
 *
 * Processes JSON-RPC style requests and returns configured responses.
 * Provides fluent builder API, request recording, and assertion helpers.
 */
export class MockMCPServer {
  private readonly options: Required<
    Pick<MockServerOptions, 'name' | 'version' | 'protocolVersion' | 'defaultDelayMs' | 'recordNotifications' | 'enforceInitialization'>
  > & Pick<MockServerOptions, 'capabilities'>;

  private readonly registry = new HandlerRegistry();
  private readonly recorder = new RequestRecorder();
  private readonly scenarioManager = new ScenarioManager();
  private readonly assertions: AssertionHelper;

  private _initialized = false;
  private _loggingLevel: string = 'info';
  private _responseInterceptors = new Map<string, (response: Record<string, unknown>) => Record<string, unknown>>();

  constructor(options: MockServerOptions) {
    this.options = {
      name: options.name,
      version: options.version,
      protocolVersion: options.protocolVersion ?? '2025-03-26',
      defaultDelayMs: options.defaultDelayMs ?? 0,
      recordNotifications: options.recordNotifications ?? true,
      enforceInitialization: options.enforceInitialization ?? true,
      capabilities: options.capabilities,
    };
    this.assertions = new AssertionHelper(this.recorder);
  }

  // ── Handler Registration (fluent) ──────────────────────────────────

  /** Register a tool. Returns a ToolBuilder for configuring responses. */
  tool(name: string, definition?: ToolDefinition): ToolBuilder {
    const handler = this.registry.registerTool(name, definition ?? {});
    return new ToolBuilder(handler);
  }

  /** Register a resource. Returns a ResourceBuilder for configuring responses. */
  resource(uri: string, definition?: ResourceDefinition): ResourceBuilder {
    const handler = this.registry.registerResource(uri, definition ?? { name: uri });
    return new ResourceBuilder(handler);
  }

  /** Register a resource template. */
  resourceTemplate(definition: ResourceTemplateDefinition): void {
    this.registry.registerResourceTemplate(definition);
  }

  /** Register a prompt. Returns a PromptBuilder for configuring responses. */
  prompt(name: string, definition?: PromptDefinition): PromptBuilder {
    const handler = this.registry.registerPrompt(name, definition ?? {});
    return new PromptBuilder(handler);
  }

  /** Register a completion handler. */
  completion(handler: CompletionHandlerFn): void {
    this.registry.setCompletionHandler(handler);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /** Reset all recorded requests and notifications. */
  resetRecordings(): void {
    this.recorder.reset();
  }

  /** Reset everything: handlers, recordings, scenario state. */
  resetAll(): void {
    this.registry.resetAll();
    this.recorder.reset();
    this.scenarioManager.clear();
    this._initialized = false;
    this._responseInterceptors.clear();
  }

  /** Close the mock server. */
  async close(): Promise<void> {
    this._initialized = false;
  }

  // ── Scenario State ─────────────────────────────────────────────────

  /** Configure a scenario state machine. */
  scenario(definition: ScenarioDefinition): void {
    this.scenarioManager.configure(definition);
  }

  /** Get the current scenario state. */
  get currentState(): string | undefined {
    return this.scenarioManager.currentState;
  }

  /** Manually set the scenario state. */
  setState(stateName: string): void {
    this.scenarioManager.setState(stateName);
  }

  // ── Request Recording ──────────────────────────────────────────────

  /** Get all recorded requests. */
  get requests(): ReadonlyArray<RecordedRequest> {
    return this.recorder.requests;
  }

  /** Get all recorded notifications. */
  get notifications(): ReadonlyArray<RecordedNotification> {
    return this.recorder.notifications;
  }

  /** Get recorded requests filtered by method. */
  requestsFor(method: string): ReadonlyArray<RecordedRequest> {
    return this.recorder.requestsFor(method);
  }

  /** Get recorded tool call requests filtered by tool name. */
  toolCalls(toolName: string): ReadonlyArray<RecordedRequest> {
    return this.recorder.toolCalls(toolName);
  }

  /** Get recorded resource read requests filtered by URI. */
  resourceReads(uri: string): ReadonlyArray<RecordedRequest> {
    return this.recorder.resourceReads(uri);
  }

  /** Get recorded prompt get requests filtered by prompt name. */
  promptGets(promptName: string): ReadonlyArray<RecordedRequest> {
    return this.recorder.promptGets(promptName);
  }

  // ── Assertions ─────────────────────────────────────────────────────

  assertToolCalled(toolName: string, times?: number): void {
    this.assertions.assertToolCalled(toolName, times);
  }

  assertToolCalledWith(toolName: string, args: Record<string, unknown>): void {
    this.assertions.assertToolCalledWith(toolName, args);
  }

  assertToolNotCalled(toolName: string): void {
    this.assertions.assertToolNotCalled(toolName);
  }

  assertResourceRead(uri: string, times?: number): void {
    this.assertions.assertResourceRead(uri, times);
  }

  assertPromptRetrieved(promptName: string, times?: number): void {
    this.assertions.assertPromptRetrieved(promptName, times);
  }

  assertMethodCalled(method: string, times?: number): void {
    this.assertions.assertMethodCalled(method, times);
  }

  assertNoRequests(): void {
    this.assertions.assertNoRequests();
  }

  assertRequestCount(count: number): void {
    this.assertions.assertRequestCount(count);
  }

  // ── Dynamic Handler Modification ───────────────────────────────────

  removeTool(name: string): void {
    this.registry.removeTool(name);
  }

  removeResource(uri: string): void {
    this.registry.removeResource(uri);
  }

  removePrompt(name: string): void {
    this.registry.removePrompt(name);
  }

  // ── Response Interceptors ──────────────────────────────────────────

  /** Register an interceptor that modifies responses for a given method. */
  interceptResponse(method: string, fn: (response: Record<string, unknown>) => Record<string, unknown>): void {
    this._responseInterceptors.set(method, fn);
  }

  // ── Fixture Loading ────────────────────────────────────────────────

  /** Load a fixture and configure the server from it. */
  loadFixture(fixture: FixtureFile): void {
    // Apply server config
    if (fixture.server.defaultDelayMs !== undefined) {
      (this.options as { defaultDelayMs: number }).defaultDelayMs = fixture.server.defaultDelayMs;
    }

    // Register tools
    if (fixture.tools) {
      for (const t of fixture.tools) {
        const builder = this.tool(t.name, {
          description: t.description,
          inputSchema: t.inputSchema,
          outputSchema: t.outputSchema,
          annotations: t.annotations,
        });
        if (t.response) builder.returns(t.response);
        if (t.error) builder.throws(t.error);
        if (t.delayMs !== undefined) builder.withDelay(t.delayMs);
        if (t.states) {
          for (const [state, response] of Object.entries(t.states)) {
            builder.inState(state, response);
          }
        }
      }
    }

    // Register resources
    if (fixture.resources) {
      for (const r of fixture.resources) {
        const builder = this.resource(r.uri, {
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        });
        if (r.response) builder.returns(r.response);
        if (r.error) builder.throws(r.error);
        if (r.delayMs !== undefined) builder.withDelay(r.delayMs);
        if (r.states) {
          for (const [state, response] of Object.entries(r.states)) {
            builder.inState(state, response);
          }
        }
      }
    }

    // Register resource templates
    if (fixture.resourceTemplates) {
      for (const rt of fixture.resourceTemplates) {
        this.resourceTemplate(rt);
      }
    }

    // Register prompts
    if (fixture.prompts) {
      for (const p of fixture.prompts) {
        const builder = this.prompt(p.name, {
          description: p.description,
          arguments: p.arguments,
        });
        if (p.response) builder.returns(p.response);
        if (p.error) builder.throws(p.error);
        if (p.delayMs !== undefined) builder.withDelay(p.delayMs);
        if (p.states) {
          for (const [state, response] of Object.entries(p.states)) {
            builder.inState(state, response);
          }
        }
      }
    }

    // Configure scenario
    if (fixture.scenario) {
      this.scenario(fixture.scenario);
    }
  }

  // ── JSON-RPC Request Processing ────────────────────────────────────

  /**
   * Process a JSON-RPC request and return a JSON-RPC response.
   * This is the core entry point for all request handling.
   */
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const startTime = Date.now();
    const params = request.params ?? {};

    try {
      // Check initialization enforcement
      if (
        this.options.enforceInitialization &&
        !this._initialized &&
        request.method !== 'initialize'
      ) {
        const error = MockErrors.invalidRequest('Server not initialized');
        this.recorder.recordRequest(request.method, params, request.id, undefined, error, Date.now() - startTime);
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: error.code, message: error.message, data: error.data },
        };
      }

      // Route to handler (uses current state for state-dependent responses)
      const result = await this.routeRequest(request.method, params);

      // Process scenario transitions AFTER handler execution
      this.scenarioManager.processRequest(request.method, params);

      const durationMs = Date.now() - startTime;

      // Apply response interceptor if present
      let response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };

      const interceptor = this._responseInterceptors.get(request.method);
      if (interceptor) {
        response = interceptor(response as unknown as Record<string, unknown>) as unknown as JsonRpcResponse;
      }

      // Record the request
      this.recorder.recordRequest(request.method, params, request.id, response.result, undefined, durationMs);

      return response;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const mockError = isMockError(err)
        ? err
        : MockErrors.internalError(err instanceof Error ? err.message : String(err));

      this.recorder.recordRequest(request.method, params, request.id, undefined, mockError, durationMs);

      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: mockError.code, message: mockError.message, data: mockError.data },
      };
    }
  }

  /**
   * Process a JSON-RPC notification (no response expected).
   */
  handleNotification(notification: JsonRpcNotification): void {
    if (this.options.recordNotifications) {
      this.recorder.recordNotification(
        notification.method,
        notification.params,
        'incoming',
      );
    }

    if (notification.method === 'notifications/initialized') {
      this._initialized = true;
    }
  }

  // ── Internal Routing ───────────────────────────────────────────────

  private async routeRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const extra: RequestExtra = {
      state: this.scenarioManager.currentState,
      server: this,
    };

    switch (method) {
      case 'initialize':
        return this.handleInitialize(params);

      case 'ping':
        return {};

      case 'tools/list':
        return { tools: this.registry.listTools() };

      case 'tools/call':
        return this.handleToolCall(params, extra);

      case 'resources/list':
        return { resources: this.registry.listResources() };

      case 'resources/read':
        return this.handleResourceRead(params, extra);

      case 'resources/templates/list':
        return { resourceTemplates: this.registry.listResourceTemplates() };

      case 'resources/subscribe':
        return {};

      case 'resources/unsubscribe':
        return {};

      case 'prompts/list':
        return { prompts: this.registry.listPrompts() };

      case 'prompts/get':
        return this.handlePromptGet(params, extra);

      case 'completion/complete':
        return this.handleCompletion(params, extra);

      case 'logging/setLevel':
        this._loggingLevel = (params.level as string) ?? 'info';
        return {};

      default:
        throw MockErrors.methodNotFound(method);
    }
  }

  private handleInitialize(params: Record<string, unknown>): Record<string, unknown> {
    this._initialized = false; // Will be set to true on notifications/initialized

    const capabilities = this.options.capabilities ?? this.registry.deriveCapabilities();

    return {
      protocolVersion: this.options.protocolVersion,
      capabilities,
      serverInfo: {
        name: this.options.name,
        version: this.options.version,
      },
    };
  }

  private async handleToolCall(
    params: Record<string, unknown>,
    extra: RequestExtra,
  ): Promise<ToolResponse> {
    const toolName = params.name as string;
    if (!toolName) {
      throw MockErrors.invalidParams('Missing tool name');
    }

    const entry = this.registry.getTool(toolName);
    if (!entry) {
      throw MockErrors.methodNotFound(`Tool not found: ${toolName}`);
    }

    const args = (params.arguments as Record<string, unknown>) ?? {};
    return executeHandler(
      entry.handler,
      [args],
      extra,
      this.options.defaultDelayMs,
    );
  }

  private async handleResourceRead(
    params: Record<string, unknown>,
    extra: RequestExtra,
  ): Promise<ResourceResponse> {
    const uri = params.uri as string;
    if (!uri) {
      throw MockErrors.invalidParams('Missing resource URI');
    }

    const entry = this.registry.getResource(uri);
    if (!entry) {
      throw MockErrors.methodNotFound(`Resource not found: ${uri}`);
    }

    return executeHandler(
      entry.handler,
      [uri],
      extra,
      this.options.defaultDelayMs,
    );
  }

  private async handlePromptGet(
    params: Record<string, unknown>,
    extra: RequestExtra,
  ): Promise<PromptResponse> {
    const promptName = params.name as string;
    if (!promptName) {
      throw MockErrors.invalidParams('Missing prompt name');
    }

    const entry = this.registry.getPrompt(promptName);
    if (!entry) {
      throw MockErrors.methodNotFound(`Prompt not found: ${promptName}`);
    }

    const args = (params.arguments as Record<string, string>) ?? {};
    return executeHandler(
      entry.handler,
      [args],
      extra,
      this.options.defaultDelayMs,
    );
  }

  private async handleCompletion(
    params: Record<string, unknown>,
    extra: RequestExtra,
  ): Promise<Record<string, unknown>> {
    const handler = this.registry.completionHandler;
    if (!handler) {
      throw MockErrors.methodNotFound('completion/complete');
    }

    const ref = params.ref as { type: 'ref/prompt' | 'ref/resource'; name?: string; uri?: string };
    const argument = params.argument as { name: string; value: string };
    const result = await handler(ref, argument, extra);
    return result as unknown as Record<string, unknown>;
  }
}

/** Check if an error looks like a MockError. */
function isMockError(err: unknown): err is MockError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err &&
    typeof (err as MockError).code === 'number' &&
    typeof (err as MockError).message === 'string'
  );
}

// ── Factory Function ─────────────────────────────────────────────────

/**
 * Create a new MockMCPServer instance.
 * Convenience function equivalent to `new MockMCPServer(options)`.
 */
export function createMockServer(options: MockServerOptions): MockMCPServer {
  return new MockMCPServer(options);
}
