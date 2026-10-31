import { Fragment } from 'react';
import { segments } from './mentionSegments';

/** Task display text with each resolved mention (`refs`) in bold. */
export function MentionText({ text, refs }: { text: string; refs?: ReadonlyArray<readonly [number, number]> }) {
  return (
    <>
      {segments(text, refs).map((s, i) => (s.ref
        ? <b key={i} style={{ fontWeight: 800 }}>{s.text}</b>
        : <Fragment key={i}>{s.text}</Fragment>))}
    </>
  );
}
