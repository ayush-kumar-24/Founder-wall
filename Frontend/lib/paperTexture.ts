import * as THREE from "three";

// Draws a sticky note face: paper fiber + graphite handwriting.
// detail 0 — mid distance: clean paper, legible writing.
// detail 1 — reading distance: fibers, fold shadow, pencil grain.
// The pressure of the pencil varies — first letters darkest, softening.

export interface HandStyle {
  slant?: number;
  inkDark?: number;
  fontScale?: number;
  caps?: boolean;
  tape?: boolean;
  underline?: boolean;
}

export function drawNoteFace(
  canvas: HTMLCanvasElement,
  text: string,
  paperColor: string,
  opts: {
    caret?: boolean;
    age?: number;
    seed?: number;
    detail?: 0 | 1;
    who?: string;
    hand?: HandStyle;
  } = {}
) {
  const S = canvas.width; // square
  const ctx = canvas.getContext("2d")!;
  const age = opts.age ?? 0;
  const seed = opts.seed ?? 1;
  const detail = opts.detail ?? 1;

  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  // paper base
  ctx.fillStyle = paperColor;
  ctx.fillRect(0, 0, S, S);

  // fiber — visible when the light rakes across it
  const fiberCount = detail ? 170 : 60;
  ctx.globalAlpha = detail ? 0.055 : 0.04;
  for (let i = 0; i < fiberCount; i++) {
    ctx.strokeStyle = rnd() > 0.5 ? "#ffffff" : "#6b5c48";
    ctx.lineWidth = (0.5 + rnd()) * (S / 256);
    ctx.beginPath();
    const x = rnd() * S,
      y = rnd() * S;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * S * 0.12, y + (rnd() - 0.5) * S * 0.02);
    ctx.stroke();
  }

  // aging vignette
  ctx.globalAlpha = 0.09 + age * 0.15;
  const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.34, S / 2, S / 2, S * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(74,60,42,1)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, S, S);
  ctx.globalAlpha = 1;

  // the folded corner — top-right, lifting off the wall.
  // A fold has three truths: the shadow it casts on the paper,
  // the lighter underside catching light, and the crease line.
  if (detail) {
    const f = S * (0.10 + age * 0.09); // older notes curl harder
    // cast shadow under the lifted corner
    const sh = ctx.createLinearGradient(S - f * 1.7, f * 1.7, S - f * 0.4, f * 0.4);
    sh.addColorStop(0, "rgba(58,46,32,0)");
    sh.addColorStop(1, "rgba(58,46,32,0.30)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.moveTo(S - f * 1.9, 0);
    ctx.lineTo(S, 0);
    ctx.lineTo(S, f * 1.9);
    ctx.closePath();
    ctx.fill();
    // the fold face — underside, slightly brighter
    ctx.fillStyle = "rgba(255,250,235,0.5)";
    ctx.beginPath();
    ctx.moveTo(S - f, 0);
    ctx.lineTo(S, 0);
    ctx.lineTo(S, f);
    ctx.closePath();
    ctx.fill();
    // crease
    ctx.strokeStyle = "rgba(90,74,54,0.35)";
    ctx.lineWidth = S / 512;
    ctx.beginPath();
    ctx.moveTo(S - f, 0);
    ctx.lineTo(S, f);
    ctx.stroke();
  }

  // ————— handwriting. Legible first, human second. —————
  const hand = opts.hand ?? {};
  const slant = hand.slant ?? 0;
  const inkDark = hand.inkDark ?? 1;
  const displayText = hand.caps ? text.toUpperCase() : text;
  const family = "'Patrick Hand', 'Caveat', 'Segoe Print', cursive";
  const margin = S * 0.115;
  const maxW = S - margin * 2;
  const maxH = S - margin * 2.1;

  const layout = (fontPx: number) => {
    ctx.font = `400 ${fontPx}px ${family}`;
    const words = displayText.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };

  // auto-fit: longer confessions write smaller, like real notes do.
  // Some hands write large, some cramped — no two densities match.
  let fontPx = Math.round(S * 0.165 * (hand.fontScale ?? 1) * (hand.caps ? 0.8 : 1));
  let lines = layout(fontPx);
  let lineH = fontPx * 1.22;
  for (let pass = 0; pass < 3 && lines.length * lineH > maxH; pass++) {
    fontPx = Math.round(fontPx * Math.sqrt(maxH / (lines.length * lineH)) * 0.98);
    lines = layout(fontPx);
    lineH = fontPx * 1.22;
  }
  ctx.textBaseline = "alphabetic";

  const totalH = lines.length * lineH;
  let y = S / 2 - totalH / 2 + fontPx * 0.85;

  let charIndex = 0;
  const totalChars = displayText.length || 1;
  let caretX = margin;
  let caretY = S / 2 + fontPx * 0.35;

  // the lean of this particular hand
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.transform(1, 0, slant, 1, 0, 0);
  ctx.translate(-S / 2, -S / 2);

  const lineRects: { x0: number; x1: number; y: number }[] = [];
  for (const ln of lines) {
    let x = margin + (rnd() - 0.5) * (S * 0.012);
    const drift = (rnd() - 0.5) * (S * 0.004); // baseline drift — the hand
    for (const ch of ln) {
      const t = charIndex / totalChars;
      const dark = (0.92 - t * 0.16) * inkDark; // this hand's pressure
      const wob = (rnd() - 0.5) * (S * 0.0026);
      if (detail) {
        // pencil grain: a soft echo stroke beside the main one
        ctx.fillStyle = `rgba(58,52,44,${dark * 0.22})`;
        ctx.fillText(ch, x + S * 0.0022, y + drift + wob + S * 0.0016);
      }
      ctx.fillStyle = `rgba(47,42,35,${dark})`;
      ctx.fillText(ch, x, y + drift + wob);
      x += ctx.measureText(ch).width;
      charIndex++;
    }
    charIndex++;
    caretX = x + S * 0.008;
    caretY = y + drift;
    lineRects.push({ x0: margin, x1: x, y: y + drift });
    y += lineH;
  }

  // some words had to be underlined — a rough graphite stroke
  if (hand.underline && lineRects.length) {
    const lr = lineRects[Math.floor(rnd() * lineRects.length)];
    const w = lr.x1 - lr.x0;
    if (w > S * 0.1) {
      const ux0 = lr.x0 + rnd() * w * 0.3;
      const ux1 = Math.min(lr.x1, ux0 + w * (0.3 + rnd() * 0.5));
      ctx.strokeStyle = `rgba(47,42,35,${0.55 * inkDark})`;
      ctx.lineWidth = Math.max(1.4, S * 0.006);
      ctx.beginPath();
      ctx.moveTo(ux0, lr.y + fontPx * 0.18);
      ctx.quadraticCurveTo(
        (ux0 + ux1) / 2,
        lr.y + fontPx * 0.18 + (rnd() - 0.5) * S * 0.01,
        ux1,
        lr.y + fontPx * 0.16
      );
      ctx.stroke();
    }
  }
  ctx.restore();

  // a graphite smudge where a thumb rested — reading distance only
  if (detail && rnd() > 0.6) {
    const sx = margin + rnd() * (S - margin * 2);
    const sy = S * 0.72 + rnd() * S * 0.14;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, S * 0.05);
    sg.addColorStop(0, "rgba(70,62,52,0.05)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(sx - S * 0.05, sy - S * 0.05, S * 0.1, S * 0.1);
  }

  // some notes needed tape to stay — aged, translucent, slightly crooked
  if (hand.tape) {
    ctx.save();
    ctx.translate(S / 2, S * 0.035);
    ctx.rotate((rnd() - 0.5) * 0.12);
    const tw = S * (0.2 + rnd() * 0.08);
    const th = S * 0.055;
    ctx.fillStyle = "rgba(228,214,170,0.38)";
    ctx.fillRect(-tw / 2, -th / 2, tw, th);
    ctx.fillStyle = "rgba(255,250,235,0.14)"; // the sheen
    ctx.fillRect(-tw / 2, -th / 2, tw, th * 0.3);
    ctx.strokeStyle = "rgba(150,132,96,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-tw / 2, -th / 2, tw, th);
    ctx.restore();
  }
  if (!lines.length) {
    caretX = margin;
    caretY = S / 2 + fontPx * 0.35;
  }

  // the sheet has a thickness — a hairline of light along the top-left
  // edge where the paper catches the room, a hairline of shade along the
  // bottom-right where it turns away. Physically thin, visually real.
  ctx.strokeStyle = "rgba(255,252,240,0.30)";
  ctx.lineWidth = Math.max(1, S * 0.004);
  ctx.beginPath();
  ctx.moveTo(1, S - 1);
  ctx.lineTo(1, 1);
  ctx.lineTo(S - 1, 1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(88,76,58,0.18)";
  ctx.beginPath();
  ctx.moveTo(S - 1, 1);
  ctx.lineTo(S - 1, S - 1);
  ctx.lineTo(1, S - 1);
  ctx.stroke();

  // the identity mark — a whisper at the bottom edge. Human, never loud.
  if (opts.who) {
    const whoPx = Math.max(10, Math.round(S * 0.068));
    ctx.font = `400 ${whoPx}px ${family}`;
    ctx.fillStyle = "rgba(47,42,35,0.42)";
    ctx.fillText(opts.who, margin, S - margin * 0.5);
  }

  // the caret — calm graphite, slower than any OS default
  if (opts.caret) {
    ctx.fillStyle = "rgba(47,42,35,0.75)";
    ctx.fillRect(caretX, caretY - fontPx * 0.72, Math.max(2, S * 0.006), fontPx * 0.82);
  }
}

export function makeNoteTexture(
  text: string,
  paperColor: string,
  size = 256,
  age = 0,
  seed = 1,
  detail: 0 | 1 = 1,
  who?: string,
  hand?: HandStyle
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  drawNoteFace(canvas, text, paperColor, { age, seed, detail, who, hand });
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
