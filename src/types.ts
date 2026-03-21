// ── Server Configuration ─────────────────────────────────────────────

export interface MockServerOptions {
  /** Server name reported in initialize response. */
  name: string;
  /** Server version reported in initialize response. */
  version: string;
  /** Protocol version to advertise. Default: '2025-03-26'. */
  protocolVersion?: string;
  /** Override automatic capability derivation. */
  capabilities?: Partial<ServerCapabilities>;
  /** Global delay applied to all responses unless overridden per-handler. Default: 0. */
  defaultDelayMs?: number;
  /** If true, record client notifications. Default: true. */
  recordNotifications?: boolean;
  /** If true, require full initialization handshake before accepting requests. Default: true. */
  enforceInitialization?: boolean;
}

export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, never>;
  completions?: Record<string, never>;
}

// ── Tool Registration ────────────────────────────────────────────────

export interface ToolDefinition {
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

export interface ToolResponse {
  content: ToolContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

export type ToolHandlerFn = (
  args: Record<string, unknown>,
  extra: RequestExtra,
) => ToolResponse | Promise<ToolResponse>;

// ── Resource Registration ────────────────────────────────────────────

export interface ResourceDefinition {
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface ResourceResponse {
  contents: ResourceContent[];
}

export type ResourceHandlerFn = (
  uri: string,
  extra: RequestExtra,
) => ResourceResponse | Promise<ResourceResponse>;

// ── Resource Template ────────────────────────────────────────────────

export interface ResourceTemplateDefinition {
  name: string;
  description?: string;
  uriTemplate: string;
  mimeType?: string;
}

// ── Prompt Registration ──────────────────────────────────────────────

export interface PromptDefinition {
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content:
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string } };
}

export interface PromptResponse {
  description?: string;
  messages: PromptMessage[];
}

export type PromptHandlerFn = (
  args: Record<string, string>,
  extra: RequestExtra,
) => PromptResponse | Promise<PromptResponse>;

// ── Completion ───────────────────────────────────────────────────────

export interface CompletionResponse {
  completion: {
    values: string[];
    total?: number;
    hasMore?: boolean;
  };
}

export type CompletionHandlerFn = (
  ref: { type: 'ref/prompt' | 'ref/resource'; name?: string; uri?: string },
  argument: { name: string; value: string },
  extra: RequestExtra,
) => CompletionResponse | Promise<CompletionResponse>;

// ── Error Simulation ─────────────────────────────────────────────────

export interface MockError {
  code: number;
  message: string;
  data?: unknown;
}

// ── Request Recording ────────────────────────────────────────────────

export interface RecordedRequest {
  seq: number;
  timestamp: string;
  method: string;
  params: Record<string, unknown>;
  id: string | number;
  response: {
    result?: unknown;
    error?: MockError;
    durationMs: number;
  };
}

export interface RecordedNotification {
  seq: number;
  timestamp: string;
  method: string;
  params?: Record<string, unknown>;
  direction: 'incoming' | 'outgoing';
}

// ── Request Extra ────────────────────────────────────────────────────

export interface RequestExtra {
  state?: string;
  server: MockMCPServerInterface;
}

/** Minimal interface for MockMCPServer to avoid circular deps. */
export interface MockMCPServerInterface {
  readonly currentState: string | undefined;
  setState(stateName: string): void;
  resetRecordings(): void;
}

// ── Scenario State Machine ───────────────────────────────────────────

export interface ScenarioDefinition {
  initialState: string;
  transitions: ScenarioTransition[];
}

export interface ScenarioTransition {
  from: string;
  method: string;
  match?: Record<string, unknown> | ((params: Record<string, unknown>) => boolean);
  to: string;
}

// ── JSON-RPC Types ───────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// ── Fixture File Format ──────────────────────────────────────────────

export interface FixtureFile {
  server: {
    name: string;
    version: string;
    protocolVersion?: string;
    defaultDelayMs?: number;
  };
  tools?: FixtureTool[];
  resources?: FixtureResource[];
  resourceTemplates?: FixtureResourceTemplate[];
  prompts?: FixturePrompt[];
  scenario?: ScenarioDefinition;
}

export interface FixtureTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
  response?: ToolResponse;
  error?: MockError;
  delayMs?: number;
  states?: Record<string, ToolResponse>;
}

export interface FixtureResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  response?: ResourceResponse;
  error?: MockError;
  delayMs?: number;
  states?: Record<string, ResourceResponse>;
}

export interface FixtureResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface FixturePrompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
  response?: PromptResponse;
  error?: MockError;
  delayMs?: number;
  states?: Record<string, PromptResponse>;
}

// ── Handler Registry Types ───────────────────────────────────────────

export interface RegisteredHandler<TResponse> {
  /** Static response to return. */
  staticResponse?: TResponse;
  /** Dynamic handler function. */
  handlerFn?: (...args: unknown[]) => TResponse | Promise<TResponse>;
  /** Error to throw as JSON-RPC error. */
  error?: MockError;
  /** Delay in ms before responding. */
  delayMs?: number;
  /** Jitter range [min, max] in ms. */
  jitter?: [number, number];
  /** If true, never respond (timeout simulation). */
  timesOut?: boolean;
  /** Maximum number of calls before exhaustion. */
  maxCalls?: number;
  /** Current call count for this handler. */
  callCount: number;
  /** State-dependent responses. */
  stateResponses: Map<string, TResponse>;
}
