/** Placeholder Durable Object so the `GameRoom` migration resolves; replaced in Task 5. */
export class GameRoom implements DurableObject {
  async fetch(): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  }
}
