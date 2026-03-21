import { describe, it, expect, beforeEach } from 'vitest';
import { ScenarioManager } from '../scenario.js';

describe('ScenarioManager', () => {
  let manager: ScenarioManager;

  beforeEach(() => {
    manager = new ScenarioManager();
  });

  describe('initial state', () => {
    it('should have no state when not configured', () => {
      expect(manager.currentState).toBeUndefined();
      expect(manager.isConfigured).toBe(false);
    });
  });

  describe('configure', () => {
    it('should set initial state', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [],
      });

      expect(manager.currentState).toBe('idle');
      expect(manager.isConfigured).toBe(true);
    });
  });

  describe('setState', () => {
    it('should manually set the state', () => {
      manager.configure({ initialState: 'idle', transitions: [] });
      manager.setState('active');
      expect(manager.currentState).toBe('active');
    });

    it('should work even without configuration', () => {
      manager.setState('custom');
      expect(manager.currentState).toBe('custom');
    });
  });

  describe('processRequest', () => {
    it('should transition on matching method', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          { from: 'idle', method: 'tools/call', to: 'active' },
        ],
      });

      const newState = manager.processRequest('tools/call', {});
      expect(newState).toBe('active');
      expect(manager.currentState).toBe('active');
    });

    it('should not transition on non-matching method', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          { from: 'idle', method: 'tools/call', to: 'active' },
        ],
      });

      const newState = manager.processRequest('resources/read', {});
      expect(newState).toBe('idle');
    });

    it('should not transition from wrong source state', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          { from: 'active', method: 'tools/call', to: 'done' },
        ],
      });

      const newState = manager.processRequest('tools/call', {});
      expect(newState).toBe('idle');
    });

    it('should match with object matcher (shallow partial match)', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          { from: 'idle', method: 'tools/call', match: { name: 'login' }, to: 'authenticated' },
        ],
      });

      // Non-matching params
      let state = manager.processRequest('tools/call', { name: 'search' });
      expect(state).toBe('idle');

      // Matching params
      state = manager.processRequest('tools/call', { name: 'login', arguments: { token: 'abc' } });
      expect(state).toBe('authenticated');
    });

    it('should match with function matcher', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          {
            from: 'idle',
            method: 'tools/call',
            match: (params) => params.name === 'start' && (params.arguments as Record<string, unknown>)?.admin === true,
            to: 'admin_active',
          },
        ],
      });

      // No match
      let state = manager.processRequest('tools/call', { name: 'start', arguments: { admin: false } });
      expect(state).toBe('idle');

      // Match
      state = manager.processRequest('tools/call', { name: 'start', arguments: { admin: true } });
      expect(state).toBe('admin_active');
    });

    it('should handle multi-step transitions', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          { from: 'idle', method: 'tools/call', match: { name: 'start' }, to: 'active' },
          { from: 'active', method: 'tools/call', match: { name: 'fetch' }, to: 'loaded' },
          { from: 'loaded', method: 'tools/call', match: { name: 'stop' }, to: 'idle' },
        ],
      });

      manager.processRequest('tools/call', { name: 'start' });
      expect(manager.currentState).toBe('active');

      manager.processRequest('tools/call', { name: 'fetch' });
      expect(manager.currentState).toBe('loaded');

      manager.processRequest('tools/call', { name: 'stop' });
      expect(manager.currentState).toBe('idle');
    });

    it('should return current state when no scenario configured', () => {
      const state = manager.processRequest('tools/call', {});
      expect(state).toBeUndefined();
    });

    it('should pick the first matching transition', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          { from: 'idle', method: 'tools/call', match: { name: 'login' }, to: 'a' },
          { from: 'idle', method: 'tools/call', match: { name: 'login' }, to: 'b' },
        ],
      });

      manager.processRequest('tools/call', { name: 'login' });
      expect(manager.currentState).toBe('a');
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      manager.configure({
        initialState: 'idle',
        transitions: [
          { from: 'idle', method: 'tools/call', to: 'active' },
        ],
      });
      manager.processRequest('tools/call', {});
      expect(manager.currentState).toBe('active');

      manager.reset();
      expect(manager.currentState).toBe('idle');
    });

    it('should reset to undefined when not configured', () => {
      manager.reset();
      expect(manager.currentState).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should completely clear scenario configuration', () => {
      manager.configure({ initialState: 'idle', transitions: [] });
      manager.clear();

      expect(manager.currentState).toBeUndefined();
      expect(manager.isConfigured).toBe(false);
    });
  });
});
