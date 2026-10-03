// Line icons on a 100-unit grid centred at the origin. icon(ctx, name, x, y, size).
const P = {
  house(c) {
    c.moveTo(-38, -2); c.lineTo(0, -36); c.lineTo(38, -2);
    c.moveTo(-28, -10); c.lineTo(-28, 34); c.lineTo(28, 34); c.lineTo(28, -10);
    c.moveTo(-9, 34); c.lineTo(-9, 12); c.lineTo(9, 12); c.lineTo(9, 34);
  },
  cart(c) {
    c.moveTo(-42, -30); c.lineTo(-28, -30); c.lineTo(-18, 14); c.lineTo(30, 14); c.lineTo(38, -16); c.lineTo(-24, -16);
    c.moveTo(-10, 30); c.arc(-14, 30, 5, 0, Math.PI * 2);
    c.moveTo(28, 30); c.arc(24, 30, 5, 0, Math.PI * 2);
  },
  bag(c) {
    c.moveTo(-30, -14); c.lineTo(30, -14); c.lineTo(34, 36); c.lineTo(-34, 36); c.closePath();
    c.moveTo(-14, -14); c.bezierCurveTo(-14, -42, 14, -42, 14, -14);
  },
  calendar(c) {
    c.roundRect(-36, -30, 72, 66, 10);
    c.moveTo(-36, -10); c.lineTo(36, -10);
    c.moveTo(-18, -40); c.lineTo(-18, -22); c.moveTo(18, -40); c.lineTo(18, -22);
  },
  clock(c) {
    c.arc(0, 0, 38, 0, Math.PI * 2);
    c.moveTo(0, -22); c.lineTo(0, 0); c.lineTo(16, 10);
  },
  lock(c) {
    c.roundRect(-30, -6, 60, 44, 10);
    c.moveTo(-18, -6); c.lineTo(-18, -18); c.bezierCurveTo(-18, -44, 18, -44, 18, -18); c.lineTo(18, -6);
    c.moveTo(0, 10); c.lineTo(0, 22);
  },
  shield(c) {
    c.moveTo(0, -40); c.lineTo(34, -26); c.lineTo(32, 6); c.bezierCurveTo(28, 28, 12, 38, 0, 42); c.bezierCurveTo(-12, 38, -28, 28, -32, 6); c.lineTo(-34, -26); c.closePath();
    c.moveTo(-14, 2); c.lineTo(-3, 13); c.lineTo(16, -10);
  },
  bank(c) {
    c.moveTo(-40, -14); c.lineTo(0, -38); c.lineTo(40, -14); c.closePath();
    c.moveTo(-28, -6); c.lineTo(-28, 24); c.moveTo(-9, -6); c.lineTo(-9, 24); c.moveTo(9, -6); c.lineTo(9, 24); c.moveTo(28, -6); c.lineTo(28, 24);
    c.moveTo(-42, 34); c.lineTo(42, 34);
  },
  phone(c) {
    c.roundRect(-22, -40, 44, 80, 10); c.moveTo(-6, 30); c.lineTo(6, 30);
  },
  sun(c) {
    c.arc(0, 0, 16, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); c.lineTo(Math.cos(a) * 38, Math.sin(a) * 38);
    }
  },
  crown(c) {
    c.moveTo(-36, 22); c.lineTo(-40, -22); c.lineTo(-16, 0); c.lineTo(0, -30); c.lineTo(16, 0); c.lineTo(40, -22); c.lineTo(36, 22); c.closePath();
  },
  car(c) {
    c.moveTo(-40, 14); c.lineTo(-40, -2); c.lineTo(-26, -6); c.lineTo(-16, -24); c.lineTo(18, -24); c.lineTo(30, -6); c.lineTo(40, -2); c.lineTo(40, 14);
    c.moveTo(-40, 14); c.lineTo(40, 14);
    c.moveTo(-18, 22); c.arc(-24, 22, 7, 0, Math.PI * 2); c.moveTo(30, 22); c.arc(24, 22, 7, 0, Math.PI * 2);
  },
  ring(c) {
    c.arc(0, 10, 26, 0, Math.PI * 2);
    c.moveTo(-12, -16); c.lineTo(0, -34); c.lineTo(12, -16); c.closePath();
  },
  chart(c) {
    c.moveTo(-40, 34); c.lineTo(40, 34);
    c.moveTo(-34, 18); c.lineTo(-12, -4); c.lineTo(6, 10); c.lineTo(36, -26);
    c.moveTo(22, -26); c.lineTo(36, -26); c.lineTo(36, -12);
  },
  down(c) {
    c.moveTo(-40, 34); c.lineTo(40, 34);
    c.moveTo(-34, -24); c.lineTo(-12, 0); c.lineTo(6, -12); c.lineTo(36, 22);
    c.moveTo(22, 22); c.lineTo(36, 22); c.lineTo(36, 8);
  },
  flag(c) {
    c.moveTo(-26, 40); c.lineTo(-26, -38);
    c.moveTo(-26, -34); c.lineTo(30, -34); c.lineTo(18, -18); c.lineTo(30, -2); c.lineTo(-26, -2);
  },
  pin(c) {
    c.moveTo(0, 40); c.bezierCurveTo(-36, 0, -30, -38, 0, -38); c.bezierCurveTo(30, -38, 36, 0, 0, 40);
    c.moveTo(10, -10); c.arc(0, -10, 10, 0, Math.PI * 2);
  },
  check(c) {
    c.moveTo(-30, 2); c.lineTo(-8, 24); c.lineTo(32, -22);
  },
  cross(c) {
    c.moveTo(-24, -24); c.lineTo(24, 24); c.moveTo(24, -24); c.lineTo(-24, 24);
  },
  receipt(c) {
    c.moveTo(-28, -38); c.lineTo(28, -38); c.lineTo(28, 38); c.lineTo(18, 30); c.lineTo(8, 38); c.lineTo(-2, 30); c.lineTo(-12, 38); c.lineTo(-22, 30); c.lineTo(-28, 38); c.closePath();
    c.moveTo(-16, -20); c.lineTo(16, -20); c.moveTo(-16, -6); c.lineTo(16, -6); c.moveTo(-16, 8); c.lineTo(4, 8);
  },
  card(c) {
    c.roundRect(-40, -26, 80, 52, 8); c.moveTo(-40, -10); c.lineTo(40, -10); c.moveTo(-28, 12); c.lineTo(-8, 12);
  },
  park(c) {
    c.roundRect(-34, -38, 68, 76, 14);
    c.moveTo(-10, 22); c.lineTo(-10, -20); c.lineTo(6, -20); c.bezierCurveTo(24, -20, 24, 6, 6, 6); c.lineTo(-10, 6);
  },
  percent(c) {
    c.moveTo(-28, 30); c.lineTo(28, -30);
    c.moveTo(-10, -22); c.arc(-20, -22, 10, 0, Math.PI * 2);
    c.moveTo(30, 22); c.arc(20, 22, 10, 0, Math.PI * 2);
  },
  scale(c) {
    c.moveTo(0, -36); c.lineTo(0, 36); c.moveTo(-22, 36); c.lineTo(22, 36);
    c.moveTo(-38, -24); c.lineTo(38, -24);
    c.moveTo(-38, -24); c.lineTo(-48, 6); c.lineTo(-28, 6); c.closePath();
    c.moveTo(38, -24); c.lineTo(28, 6); c.lineTo(48, 6); c.closePath();
  },
  cash(c) {
    c.roundRect(-42, -24, 84, 48, 6); c.moveTo(12, 0); c.arc(0, 0, 12, 0, Math.PI * 2);
    c.moveTo(-30, -12); c.lineTo(-24, -12); c.moveTo(24, 12); c.lineTo(30, 12);
  },
  qr(c) {
    c.rect(-36, -36, 26, 26); c.rect(10, -36, 26, 26); c.rect(-36, 10, 26, 26);
    c.rect(14, 14, 8, 8); c.rect(28, 28, 8, 8); c.rect(28, 10, 8, 8); c.rect(10, 28, 8, 8);
  },
  unlink(c) {
    c.moveTo(-6, -18); c.lineTo(6, -30); c.bezierCurveTo(16, -40, 36, -20, 26, -10); c.lineTo(14, 2);
    c.moveTo(6, 18); c.lineTo(-6, 30); c.bezierCurveTo(-16, 40, -36, 20, -26, 10); c.lineTo(-14, -2);
    c.moveTo(-34, -34); c.lineTo(-22, -22); c.moveTo(34, 34); c.lineTo(22, 22);
  },
  users(c) {
    c.moveTo(-6, -16); c.arc(-16, -16, 10, 0, Math.PI * 2);
    c.moveTo(-36, 26); c.bezierCurveTo(-36, 0, 4, 0, 4, 26);
    c.moveTo(26, -12); c.arc(18, -12, 8, 0, Math.PI * 2);
    c.moveTo(8, 6); c.bezierCurveTo(22, 0, 38, 8, 38, 26);
  },
  plane(c) {
    c.moveTo(-40, 6); c.lineTo(40, -20); c.lineTo(20, 32); c.lineTo(4, 10); c.closePath(); c.moveTo(4, 10); c.lineTo(40, -20);
  },
  heart(c) {
    c.moveTo(0, 34); c.bezierCurveTo(-48, 2, -30, -40, 0, -16); c.bezierCurveTo(30, -40, 48, 2, 0, 34);
  },
  spark(c) {
    c.moveTo(0, -40); c.quadraticCurveTo(4, -4, 40, 0); c.quadraticCurveTo(4, 4, 0, 40); c.quadraticCurveTo(-4, 4, -40, 0); c.quadraticCurveTo(-4, -4, 0, -40);
  },
  arrowR(c) {
    c.moveTo(-34, 0); c.lineTo(32, 0); c.moveTo(14, -18); c.lineTo(32, 0); c.lineTo(14, 18);
  },
  arrowL(c) {
    c.moveTo(34, 0); c.lineTo(-32, 0); c.moveTo(-14, -18); c.lineTo(-32, 0); c.lineTo(-14, 18);
  },
  food(c) {
    c.moveTo(-30, -10); c.lineTo(30, -10); c.lineTo(24, 36); c.lineTo(-24, 36); c.closePath();
    c.moveTo(-14, -10); c.bezierCurveTo(-14, -36, 14, -36, 14, -10);
    c.moveTo(-8, 10); c.lineTo(8, 10);
  },
  book(c) {
    c.moveTo(0, -26); c.bezierCurveTo(-14, -36, -32, -34, -40, -30); c.lineTo(-40, 30); c.bezierCurveTo(-32, 26, -14, 24, 0, 34);
    c.bezierCurveTo(14, 24, 32, 26, 40, 30); c.lineTo(40, -30); c.bezierCurveTo(32, -34, 14, -36, 0, -26); c.lineTo(0, 34);
  },
  gauge(c) {
    c.arc(0, 14, 38, Math.PI, 0); c.moveTo(0, 14); c.lineTo(22, -10);
  },
  refresh(c) {
    c.arc(0, 0, 30, -0.3, Math.PI * 1.5);
    c.moveTo(16, -42); c.lineTo(2, -30); c.lineTo(18, -18);
  },
};

export function icon(ctx, name, x, y, size, { color = '#0D0D12', lw = 7, fill = null, rot = 0, alpha = 1 } = {}) {
  const f = P[name];
  if (!f) throw new Error('unknown icon ' + name);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size / 100, size / 100);
  ctx.beginPath();
  f(ctx);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** An icon on a rounded tile (app-icon look). */
export function iconTile(ctx, name, x, y, size, bg, { fg = '#fff', radius = 0.28, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(x, y - size / 2, x, y + size / 2);
  g.addColorStop(0, bg);
  g.addColorStop(1, shade(bg));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x - size / 2, y - size / 2, size, size, size * radius);
  ctx.fill();
  ctx.restore();
  icon(ctx, name, x, y, size * 0.62, { color: fg, lw: 9, alpha });
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.8);
  const g = Math.round(((n >> 8) & 255) * 0.8);
  const b = Math.round((n & 255) * 0.8);
  return `rgb(${r},${g},${b})`;
}

export const ICONS = Object.keys(P);
