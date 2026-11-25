/**
 * A QR code as one SVG path, for the group invite link.
 *
 * The encoder (`qrcode-generator`, MIT, no dependencies) is loaded only when an
 * invite is shown. Error correction M survives a scuffed or glare-washed
 * screen; the link is short, so the code stays small enough to scan from a
 * phone held at arm's length.
 */
export interface QrShape {
  /** Modules per side, without the quiet zone. */
  size: number;
  /** One path of 1×1 squares, in module units. */
  d: string;
}

export async function qrShape(text: string): Promise<QrShape> {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { size, d };
}
