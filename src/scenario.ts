import type { ScenarioDefinition, ScenarioTransition } from './types.js';

/**
 * Manages scenario state machine for multi-step interaction testing.
 */
export class ScenarioManager {
  private _definition: ScenarioDefinition | undefined;
  private _currentState: string | undefined;

  /** Configure the scenario state machine. */
  configure(definition: ScenarioDefinition): void {
    this._definition = definition;
    this._currentState = definition.initialState;
  }

  /** Get the current scenario state. */
  get currentState(): string | undefined {
    return this._currentState;
  }

  /** Manually set the scenario state. */
  setState(stateName: string): void {
    this._currentState = stateName;
  }

  /** Check if a scenario is configured. */
  get isConfigured(): boolean {
    return this._definition !== undefined;
  }

  /**
   * Process a request and check for state transitions.
   * Returns the new state if a transition occurred, or the current state.
   */
  processRequest(method: string, params: Record<string, unknown>): string | undefined {
    if (!this._definition || this._currentState === undefined) {
      return this._currentState;
    }

    for (const transition of this._definition.transitions) {
      if (this.matchesTransition(transition, method, params)) {
        this._currentState = transition.to;
        return this._currentState;
      }
    }

    return this._currentState;
  }

  /** Check if a transition matches the current request. */
  private matchesTransition(
    transition: ScenarioTransition,
    method: string,
    params: Record<string, unknown>,
  ): boolean {
    // Must be in the correct source state
    if (transition.from !== this._currentState) {
      return false;
    }

    // Method must match
    if (transition.method !== method) {
      return false;
    }

    // If no match criteria, any params match
    if (transition.match === undefined) {
      return true;
    }

    // Function matcher
    if (typeof transition.match === 'function') {
      return transition.match(params);
    }

    // Object matcher: shallow partial match on params
    return this.shallowPartialMatch(params, transition.match);
  }

  /** Check if target contains all key-value pairs from pattern (shallow). */
  private shallowPartialMatch(
    target: Record<string, unknown>,
    pattern: Record<string, unknown>,
  ): boolean {
    for (const [key, value] of Object.entries(pattern)) {
      if (target[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /** Reset the scenario to initial state. */
  reset(): void {
    if (this._definition) {
      this._currentState = this._definition.initialState;
    } else {
      this._currentState = undefined;
    }
  }

  /** Completely clear the scenario configuration. */
  clear(): void {
    this._definition = undefined;
    this._currentState = undefined;
  }
}
