export { GameRoom } from './room/GameRoom';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  FIREBASE_PROJECT_ID: string;
  AUTH_MODE: 'firebase' | 'emulator';
  ADMIN_TOKEN?: string;
}

export default {
  /** Routes grow in Task 5; for now only the health probe is served. */
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && pathname === '/health') return new Response('ok');
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
