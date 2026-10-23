import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RisoButton } from '../../components/riso/RisoButton';
import { RisoCard } from '../../components/riso/RisoCard';
import styles from './ShareCard.module.css';

/** The game code; for the host also the join link, a copy button and a QR of it. */
export function ShareCard({ code, isHost }: { code: string; isHost: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/g/${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <RisoCard padded className={styles.card}>
      <div className={styles.code} aria-label="Game code">{code}</div>
      {isHost && (
        <>
          <div role="img" aria-label="QR code" className={styles.qr}>
            <QRCodeSVG value={link} size={176} marginSize={2} />
          </div>
          <a className={styles.link} href={link}>{link}</a>
          <RisoButton onClick={copy} fullWidth>{copied ? 'Copied' : 'Copy link'}</RisoButton>
        </>
      )}
    </RisoCard>
  );
}
