import type {
  ToolResponse,
  ToolHandlerFn,
  ResourceResponse,
  ResourceHandlerFn,
  PromptResponse,
  PromptHandlerFn,
  MockError,
  RegisteredHandler,
} from './types.js';

// ── Tool Builder ─────────────────────────────────────────────────────

export class ToolBuilder {
  constructor(private readonly handler: RegisteredHandler<ToolResponse>) {}

  /** Set a static response for this tool. */
  returns(response: ToolResponse): this {
    this.handler.staticResponse = response;
    return this;
  }

  /** Set a dynamic handler function for this tool. */
  handlerFn(fn: ToolHandlerFn): this {
    this.handler.handlerFn = fn as (...args: unknown[]) => ToolResponse | Promise<ToolResponse>;
    return this;
  }

  /** Make this tool return a JSON-RPC error. */
  throws(error: MockError): this {
    this.handler.error = error;
    return this;
  }

  /** Add a delay before this tool responds. */
  withDelay(ms: number): this {
    this.handler.delayMs = ms;
    return this;
  }

  /** Add random jitter to the delay. */
  withJitter(minMs: number, maxMs: number): this {
    if (minMs > maxMs) {
      throw new Error(`withJitter: minMs (${minMs}) must be <= maxMs (${maxMs})`);
    }
    this.handler.jitter = [minMs, maxMs];
    return this;
  }

  /** Make this tool time out (never respond). */
  timesOut(): this {
    this.handler.timesOut = true;
    return this;
  }

  /** Make this tool respond only N times, then throw. */
  times(n: number): this {
    this.handler.maxCalls = n;
    return this;
  }

  /** Make this tool respond differently based on scenario state. */
  inState(stateName: string, response: ToolResponse): this {
    this.handler.stateResponses.set(stateName, response);
    return this;
  }
}

// ── Resource Builder ─────────────────────────────────────────────────

export class ResourceBuilder {
  constructor(private readonly handler: RegisteredHandler<ResourceResponse>) {}

  /** Set static content for this resource. */
  returns(response: ResourceResponse): this {
    this.handler.staticResponse = response;
    return this;
  }

  /** Set a dynamic handler function for this resource. */
  handlerFn(fn: ResourceHandlerFn): this {
    this.handler.handlerFn = fn as (...args: unknown[]) => ResourceResponse | Promise<ResourceResponse>;
    return this;
  }

  /** Make this resource return a JSON-RPC error. */
  throws(error: MockError): this {
    this.handler.error = error;
    return this;
  }

  /** Add a delay before this resource responds. */
  withDelay(ms: number): this {
    this.handler.delayMs = ms;
    return this;
  }

  /** Make this resource time out (never respond). */
  timesOut(): this {
    this.handler.timesOut = true;
    return this;
  }

  /** Make this resource respond differently based on scenario state. */
  inState(stateName: string, response: ResourceResponse): this {
    this.handler.stateResponses.set(stateName, response);
    return this;
  }
}

// ── Prompt Builder ───────────────────────────────────────────────────

export class PromptBuilder {
  constructor(private readonly handler: RegisteredHandler<PromptResponse>) {}

  /** Set a static response for this prompt. */
  returns(response: PromptResponse): this {
    this.handler.staticResponse = response;
    return this;
  }

  /** Set a dynamic handler function for this prompt. */
  handlerFn(fn: PromptHandlerFn): this {
    this.handler.handlerFn = fn as (...args: unknown[]) => PromptResponse | Promise<PromptResponse>;
    return this;
  }

  /** Make this prompt return a JSON-RPC error. */
  throws(error: MockError): this {
    this.handler.error = error;
    return this;
  }

  /** Add a delay before this prompt responds. */
  withDelay(ms: number): this {
    this.handler.delayMs = ms;
    return this;
  }

  /** Make this prompt respond differently based on scenario state. */
  inState(stateName: string, response: PromptResponse): this {
    this.handler.stateResponses.set(stateName, response);
    return this;
  }
}
