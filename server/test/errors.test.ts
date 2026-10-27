import { describe, expect, it } from 'vitest';
import { AppError, toAck } from '../src/errors';

describe('toAck', () => {
  it('maps an AppError to a failure ack with its details', () => {
    expect(toAck('a1', new AppError('not-host', { x: 1 }))).toEqual({
      t: 'ack', id: 'a1', ok: false, code: 'not-host', details: { x: 1 },
    });
  });

  it('omits details when the error has none', () => {
    expect(toAck('a2', new AppError('wrong-stage'))).toEqual({ t: 'ack', id: 'a2', ok: false, code: 'wrong-stage' });
  });

  it('maps an unknown error to code unknown without leaking its message', () => {
    const ack = toAck('a3', new Error('secret'));
    expect(ack).toMatchObject({ ok: false, code: 'unknown' });
    expect(JSON.stringify(ack)).not.toContain('secret');
  });
});
