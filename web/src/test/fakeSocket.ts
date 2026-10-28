/**
 * A scriptable stand-in for the browser `WebSocket`, covering the surface `RoomConnection` uses
 * (`send`, `close`, `onopen` / `onmessage` / `onclose`, `readyState`). Every constructed socket is
 * recorded in `FakeSocket.instances`; tests drive the server side with `open`, `serverSend` and `serverClose`.
 */
export class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  closeCalls: Array<number | undefined> = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  /** The newest socket constructed. */
  static last(): FakeSocket {
    const s = FakeSocket.instances[FakeSocket.instances.length - 1];
    if (!s) throw new Error('no FakeSocket constructed');
    return s;
  }

  /** Forget every recorded socket. */
  static reset(): void {
    FakeSocket.instances = [];
  }

  send(data: string): void {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('send on a socket that is not open');
    this.sent.push(data);
  }

  /** Client-initiated close: recorded; the close event is delivered only by `serverClose`. */
  close(code?: number): void {
    this.closeCalls.push(code);
    this.readyState = FakeSocket.CLOSING;
  }

  /** Every JSON frame sent so far, parsed (raw text frames like `ping` are skipped). */
  frames(): Array<Record<string, unknown>> {
    return this.sent.filter((s) => s.startsWith('{')).map((s) => JSON.parse(s) as Record<string, unknown>);
  }

  /** Completes the handshake. */
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Delivers one frame from the server: objects are JSON-encoded, strings go as-is. */
  serverSend(msg: object | string): void {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  /** Delivers a close event with `code` (and `reason`). */
  serverClose(code = 1006, reason = ''): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}
