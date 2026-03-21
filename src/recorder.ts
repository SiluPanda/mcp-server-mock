import type { RecordedRequest, RecordedNotification, MockError } from './types.js';

/**
 * Records all incoming requests and notifications for post-hoc assertion.
 */
export class RequestRecorder {
  private _requests: RecordedRequest[] = [];
  private _notifications: RecordedNotification[] = [];
  private _requestSeq = 0;
  private _notificationSeq = 0;

  /** Record a request and its response. */
  recordRequest(
    method: string,
    params: Record<string, unknown>,
    id: string | number,
    result: unknown | undefined,
    error: MockError | undefined,
    durationMs: number,
  ): RecordedRequest {
    const record: RecordedRequest = {
      seq: ++this._requestSeq,
      timestamp: new Date().toISOString(),
      method,
      params,
      id,
      response: { result, error, durationMs },
    };
    this._requests.push(record);
    return record;
  }

  /** Record an incoming or outgoing notification. */
  recordNotification(
    method: string,
    params: Record<string, unknown> | undefined,
    direction: 'incoming' | 'outgoing',
  ): RecordedNotification {
    const record: RecordedNotification = {
      seq: ++this._notificationSeq,
      timestamp: new Date().toISOString(),
      method,
      params,
      direction,
    };
    this._notifications.push(record);
    return record;
  }

  /** Get all recorded requests. */
  get requests(): ReadonlyArray<RecordedRequest> {
    return this._requests;
  }

  /** Get all recorded notifications. */
  get notifications(): ReadonlyArray<RecordedNotification> {
    return this._notifications;
  }

  /** Get recorded requests filtered by method. */
  requestsFor(method: string): ReadonlyArray<RecordedRequest> {
    return this._requests.filter((r) => r.method === method);
  }

  /** Get recorded tool call requests filtered by tool name. */
  toolCalls(toolName: string): ReadonlyArray<RecordedRequest> {
    return this._requests.filter(
      (r) => r.method === 'tools/call' && r.params?.name === toolName,
    );
  }

  /** Get recorded resource read requests filtered by URI. */
  resourceReads(uri: string): ReadonlyArray<RecordedRequest> {
    return this._requests.filter(
      (r) => r.method === 'resources/read' && r.params?.uri === uri,
    );
  }

  /** Get recorded prompt get requests filtered by prompt name. */
  promptGets(promptName: string): ReadonlyArray<RecordedRequest> {
    return this._requests.filter(
      (r) => r.method === 'prompts/get' && r.params?.name === promptName,
    );
  }

  /** Get the last N recorded requests. */
  lastRequests(n: number): ReadonlyArray<RecordedRequest> {
    return this._requests.slice(-n);
  }

  /** Get total request count. */
  get requestCount(): number {
    return this._requests.length;
  }

  /** Reset all recordings. */
  reset(): void {
    this._requests = [];
    this._notifications = [];
    this._requestSeq = 0;
    this._notificationSeq = 0;
  }
}
