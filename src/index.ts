// mcp-server-mock - Programmable mock MCP server for integration testing

export { MockMCPServer, createMockServer } from './server.js';
export { MockErrors } from './errors.js';
export { ToolBuilder, ResourceBuilder, PromptBuilder } from './builder.js';
export { RequestRecorder } from './recorder.js';
export { HandlerRegistry } from './registry.js';
export { ScenarioManager } from './scenario.js';
export { AssertionHelper } from './assertions.js';

export type {
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
} from './types.js';
