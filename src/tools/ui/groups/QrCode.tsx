import { useEffect, useState } from 'react';
import { qrShape, type QrShape } from '../../lib/qr';

/**
 * A scannable QR code. Always dark on white with a four-module quiet zone,
 * whatever the theme: many scanners can't read a light-on-dark code.
 */
export function QrCode({ text, label, size = 184 }: { text: string; label: string; size?: number }) {
  const [shape, setShape] = useState<{ text: string; shape: QrShape } | null>(null);
  useEffect(() => {
    let live = true;
    qrShape(text).then((s) => { if (live) setShape({ text, shape: s }); }).catch(() => {});
    return () => { live = false; };
  }, [text]);
  const current = shape?.text === text ? shape.shape : null;
  const quiet = 4;
  const box = current ? current.size + quiet * 2 : 1;
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: '#fff', padding: 0, overflow: 'hidden', flexShrink: 0 }}>
      {current ? (
        <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${box} ${box}`} shapeRendering="crispEdges">
          <rect width={box} height={box} fill="#fff" />
          <path transform={`translate(${quiet} ${quiet})`} d={current.d} fill="#000" />
        </svg>
      ) : (
        <div role="img" aria-label={`${label} (loading)`} style={{ width: size, height: size }} />
      )}
    </div>
  );
}
