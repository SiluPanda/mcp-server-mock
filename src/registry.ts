import type {
  ToolDefinition,
  ToolResponse,
  ToolHandlerFn,
  ResourceDefinition,
  ResourceResponse,
  ResourceHandlerFn,
  ResourceTemplateDefinition,
  PromptDefinition,
  PromptResponse,
  PromptHandlerFn,
  CompletionHandlerFn,
  MockError,
  RegisteredHandler,
  RequestExtra,
} from './types.js';

// ── Registered Handler Entry ─────────────────────────────────────────

export interface ToolEntry {
  name: string;
  definition: ToolDefinition;
  handler: RegisteredHandler<ToolResponse>;
}

export interface ResourceEntry {
  uri: string;
  definition: ResourceDefinition;
  handler: RegisteredHandler<ResourceResponse>;
}

export interface PromptEntry {
  name: string;
  definition: PromptDefinition;
  handler: RegisteredHandler<PromptResponse>;
}

// ── Handler Registry ─────────────────────────────────────────────────

export class HandlerRegistry {
  private _tools = new Map<string, ToolEntry>();
  private _resources = new Map<string, ResourceEntry>();
  private _resourceTemplates: ResourceTemplateDefinition[] = [];
  private _prompts = new Map<string, PromptEntry>();
  private _completionHandler: CompletionHandlerFn | undefined;

  // ── Tool Registration ────────────────────────────────────────────

  registerTool(name: string, definition: ToolDefinition): RegisteredHandler<ToolResponse> {
    const handler: RegisteredHandler<ToolResponse> = {
      callCount: 0,
      stateResponses: new Map(),
    };
    this._tools.set(name, { name, definition, handler });
    return handler;
  }

  getTool(name: string): ToolEntry | undefined {
    return this._tools.get(name);
  }

  removeTool(name: string): boolean {
    return this._tools.delete(name);
  }

  get tools(): ReadonlyMap<string, ToolEntry> {
    return this._tools;
  }

  listTools(): Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
  }> {
    return Array.from(this._tools.values()).map((entry) => ({
      name: entry.name,
      description: entry.definition.description,
      inputSchema: entry.definition.inputSchema ?? { type: 'object' },
      ...(entry.definition.outputSchema && { outputSchema: entry.definition.outputSchema }),
      ...(entry.definition.annotations && { annotations: entry.definition.annotations as Record<string, unknown> }),
    }));
  }

  // ── Resource Registration ────────────────────────────────────────

  registerResource(uri: string, definition: ResourceDefinition): RegisteredHandler<ResourceResponse> {
    const handler: RegisteredHandler<ResourceResponse> = {
      callCount: 0,
      stateResponses: new Map(),
    };
    this._resources.set(uri, { uri, definition, handler });
    return handler;
  }

  getResource(uri: string): ResourceEntry | undefined {
    return this._resources.get(uri);
  }

  removeResource(uri: string): boolean {
    return this._resources.delete(uri);
  }

  get resources(): ReadonlyMap<string, ResourceEntry> {
    return this._resources;
  }

  listResources(): Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> {
    return Array.from(this._resources.values()).map((entry) => ({
      uri: entry.uri,
      name: entry.definition.name,
      ...(entry.definition.description && { description: entry.definition.description }),
      ...(entry.definition.mimeType && { mimeType: entry.definition.mimeType }),
    }));
  }

  // ── Resource Template Registration ───────────────────────────────

  registerResourceTemplate(definition: ResourceTemplateDefinition): void {
    this._resourceTemplates.push(definition);
  }

  listResourceTemplates(): ResourceTemplateDefinition[] {
    return [...this._resourceTemplates];
  }

  // ── Prompt Registration ──────────────────────────────────────────

  registerPrompt(name: string, definition: PromptDefinition): RegisteredHandler<PromptResponse> {
    const handler: RegisteredHandler<PromptResponse> = {
      callCount: 0,
      stateResponses: new Map(),
    };
    this._prompts.set(name, { name, definition, handler });
    return handler;
  }

  getPrompt(name: string): PromptEntry | undefined {
    return this._prompts.get(name);
  }

  removePrompt(name: string): boolean {
    return this._prompts.delete(name);
  }

  get prompts(): ReadonlyMap<string, PromptEntry> {
    return this._prompts;
  }

  listPrompts(): Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }> {
    return Array.from(this._prompts.values()).map((entry) => ({
      name: entry.name,
      ...(entry.definition.description && { description: entry.definition.description }),
      ...(entry.definition.arguments && { arguments: entry.definition.arguments }),
    }));
  }

  // ── Completion Registration ──────────────────────────────────────

  setCompletionHandler(handler: CompletionHandlerFn): void {
    this._completionHandler = handler;
  }

  get completionHandler(): CompletionHandlerFn | undefined {
    return this._completionHandler;
  }

  // ── Capability Derivation ────────────────────────────────────────

  deriveCapabilities(): Record<string, unknown> {
    const caps: Record<string, unknown> = {};
    if (this._tools.size > 0) {
      caps.tools = { listChanged: true };
    }
    if (this._resources.size > 0 || this._resourceTemplates.length > 0) {
      caps.resources = { subscribe: true, listChanged: true };
    }
    if (this._prompts.size > 0) {
      caps.prompts = { listChanged: true };
    }
    caps.logging = {};
    if (this._completionHandler) {
      caps.completions = {};
    }
    return caps;
  }

  // ── Reset ────────────────────────────────────────────────────────

  resetAll(): void {
    this._tools.clear();
    this._resources.clear();
    this._resourceTemplates = [];
    this._prompts.clear();
    this._completionHandler = undefined;
  }
}

// ── Handler Execution ────────────────────────────────────────────────

export async function executeHandler<TResponse>(
  handler: RegisteredHandler<TResponse>,
  args: unknown[],
  extra: RequestExtra,
  defaultDelayMs: number,
): Promise<TResponse> {
  // Check exhaustion
  if (handler.maxCalls !== undefined && handler.callCount >= handler.maxCalls) {
    throw {
      code: -32603,
      message: `Handler exhausted after ${handler.maxCalls} calls`,
    } as MockError;
  }

  handler.callCount++;

  // Check error injection
  if (handler.error) {
    throw handler.error;
  }

  // Check timeout
  if (handler.timesOut) {
    return new Promise<TResponse>(() => {
      // Never resolves — simulates a timeout
    });
  }

  // Apply delay
  const delay = handler.jitter
    ? handler.jitter[0] + Math.random() * (handler.jitter[1] - handler.jitter[0])
    : handler.delayMs ?? defaultDelayMs;

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Check state-dependent response
  const currentState = extra.state;
  if (currentState !== undefined && handler.stateResponses.has(currentState)) {
    return handler.stateResponses.get(currentState)!;
  }

  // Check dynamic handler
  if (handler.handlerFn) {
    return handler.handlerFn(...args, extra) as Promise<TResponse>;
  }

  // Check static response
  if (handler.staticResponse !== undefined) {
    return handler.staticResponse;
  }

  // No handler configured — if there are state responses but no match, throw
  if (handler.stateResponses.size > 0) {
    throw {
      code: -32603,
      message: `No handler for current state "${currentState}"`,
    } as MockError;
  }

  throw {
    code: -32603,
    message: 'No response configured for handler',
  } as MockError;
}
