import { describe, it, expect } from 'vitest';
import { ToolBuilder, ResourceBuilder, PromptBuilder } from '../builder.js';
import type { RegisteredHandler, ToolResponse, ResourceResponse, PromptResponse } from '../types.js';

function makeHandler<T>(): RegisteredHandler<T> {
  return {
    callCount: 0,
    stateResponses: new Map(),
  };
}

describe('ToolBuilder', () => {
  it('should set static response via returns()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    const response: ToolResponse = { content: [{ type: 'text', text: 'hello' }] };
    const result = builder.returns(response);

    expect(handler.staticResponse).toBe(response);
    expect(result).toBe(builder); // fluent
  });

  it('should set handler function via handlerFn()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    const fn = () => ({ content: [{ type: 'text' as const, text: 'ok' }] });
    builder.handlerFn(fn);

    expect(handler.handlerFn).toBeDefined();
  });

  it('should set error via throws()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    builder.throws({ code: -32603, message: 'fail' });
    expect(handler.error).toEqual({ code: -32603, message: 'fail' });
  });

  it('should set delay via withDelay()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    builder.withDelay(500);
    expect(handler.delayMs).toBe(500);
  });

  it('should set jitter via withJitter()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    builder.withJitter(100, 500);
    expect(handler.jitter).toEqual([100, 500]);
  });

  it('withJitter throws if minMs > maxMs', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    expect(() => {
      builder.returns({ content: [] }).withJitter(500, 100);
    }).toThrow('minMs');
  });

  it('should set timeout via timesOut()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    builder.timesOut();
    expect(handler.timesOut).toBe(true);
  });

  it('should set maxCalls via times()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    builder.times(3);
    expect(handler.maxCalls).toBe(3);
  });

  it('should set state-dependent response via inState()', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    const response: ToolResponse = { content: [{ type: 'text', text: 'active' }] };
    builder.inState('active', response);

    expect(handler.stateResponses.get('active')).toBe(response);
  });

  it('should support fluent chaining', () => {
    const handler = makeHandler<ToolResponse>();
    const builder = new ToolBuilder(handler);

    const result = builder
      .returns({ content: [{ type: 'text', text: 'ok' }] })
      .withDelay(100)
      .times(5)
      .inState('active', { content: [{ type: 'text', text: 'active' }] });

    expect(result).toBe(builder);
    expect(handler.staticResponse).toBeDefined();
    expect(handler.delayMs).toBe(100);
    expect(handler.maxCalls).toBe(5);
    expect(handler.stateResponses.size).toBe(1);
  });
});

describe('ResourceBuilder', () => {
  it('should set static response via returns()', () => {
    const handler = makeHandler<ResourceResponse>();
    const builder = new ResourceBuilder(handler);

    const response: ResourceResponse = {
      contents: [{ uri: 'file:///a.txt', text: 'content' }],
    };
    builder.returns(response);
    expect(handler.staticResponse).toBe(response);
  });

  it('should set handler function via handlerFn()', () => {
    const handler = makeHandler<ResourceResponse>();
    const builder = new ResourceBuilder(handler);

    const fn = (uri: string) => ({
      contents: [{ uri, text: 'content' }],
    });
    builder.handlerFn(fn);
    expect(handler.handlerFn).toBeDefined();
  });

  it('should set error via throws()', () => {
    const handler = makeHandler<ResourceResponse>();
    const builder = new ResourceBuilder(handler);

    builder.throws({ code: -32601, message: 'not found' });
    expect(handler.error).toEqual({ code: -32601, message: 'not found' });
  });

  it('should set delay via withDelay()', () => {
    const handler = makeHandler<ResourceResponse>();
    const builder = new ResourceBuilder(handler);

    builder.withDelay(200);
    expect(handler.delayMs).toBe(200);
  });

  it('should set timeout via timesOut()', () => {
    const handler = makeHandler<ResourceResponse>();
    const builder = new ResourceBuilder(handler);

    builder.timesOut();
    expect(handler.timesOut).toBe(true);
  });

  it('should set state-dependent response via inState()', () => {
    const handler = makeHandler<ResourceResponse>();
    const builder = new ResourceBuilder(handler);

    const response: ResourceResponse = {
      contents: [{ uri: 'file:///a.txt', text: 'active-content' }],
    };
    builder.inState('active', response);
    expect(handler.stateResponses.get('active')).toBe(response);
  });
});

describe('PromptBuilder', () => {
  it('should set static response via returns()', () => {
    const handler = makeHandler<PromptResponse>();
    const builder = new PromptBuilder(handler);

    const response: PromptResponse = {
      messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
    };
    builder.returns(response);
    expect(handler.staticResponse).toBe(response);
  });

  it('should set handler function via handlerFn()', () => {
    const handler = makeHandler<PromptResponse>();
    const builder = new PromptBuilder(handler);

    const fn = () => ({
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'ok' } }],
    });
    builder.handlerFn(fn);
    expect(handler.handlerFn).toBeDefined();
  });

  it('should set error via throws()', () => {
    const handler = makeHandler<PromptResponse>();
    const builder = new PromptBuilder(handler);

    builder.throws({ code: -32601, message: 'not found' });
    expect(handler.error).toEqual({ code: -32601, message: 'not found' });
  });

  it('should set delay via withDelay()', () => {
    const handler = makeHandler<PromptResponse>();
    const builder = new PromptBuilder(handler);

    builder.withDelay(300);
    expect(handler.delayMs).toBe(300);
  });

  it('should set state-dependent response via inState()', () => {
    const handler = makeHandler<PromptResponse>();
    const builder = new PromptBuilder(handler);

    const response: PromptResponse = {
      messages: [{ role: 'assistant', content: { type: 'text', text: 'hi' } }],
    };
    builder.inState('active', response);
    expect(handler.stateResponses.get('active')).toBe(response);
  });

  it('should support fluent chaining', () => {
    const handler = makeHandler<PromptResponse>();
    const builder = new PromptBuilder(handler);

    const result = builder
      .returns({ messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }] })
      .withDelay(50)
      .inState('active', { messages: [{ role: 'user', content: { type: 'text', text: 'active' } }] });

    expect(result).toBe(builder);
  });
});
