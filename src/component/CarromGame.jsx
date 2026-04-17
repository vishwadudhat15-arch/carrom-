import { useState, useRef, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BASE = 600;
const FRAME = BASE * 0.09;
const INNER = BASE - FRAME * 2;
const CX = BASE / 2;
const CY = BASE / 2;
const PR = BASE * 0.024;
const SR = BASE * 0.031;
const POCKET_R = BASE * 0.052;
const FRICTION = 0.983;
const RESTITUTION = 0.78;
const MIN_V = 0.15;
const BOUNDS = { L: FRAME, R: BASE - FRAME, T: FRAME, B: BASE - FRAME };
const POCKETS = [
  { x: FRAME, y: FRAME },
  { x: BASE - FRAME, y: FRAME },
  { x: FRAME, y: BASE - FRAME },
  { x: BASE - FRAME, y: BASE - FRAME },
];

const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

const nearestPocket = (p) => {
  let best = null, bd = Infinity;
  POCKETS.forEach((pk) => {
    const d = Math.hypot(p.x - pk.x, p.y - pk.y);
    if (d < bd) { bd = d; best = pk; }
  });
  return best;
};

function createPieces() {
  const arr = [];
  const gap = 1.04;

  arr.push({
    id: "queen", x: CX, y: CY, vx: 0, vy: 0,
    type: "queen", pocketed: false, sinking: false, sinkScale: 1,
  });

  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const rd = 2 * PR * gap;
    arr.push({
      id: "inner" + i,
      x: CX + Math.cos(a) * rd,
      y: CY + Math.sin(a) * rd,
      vx: 0, vy: 0,
      type: i % 2 === 0 ? "white" : "black",
      pocketed: false, sinking: false, sinkScale: 1,
    });
  }

  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const rd = (i % 2 === 0 ? 4 * PR : 2 * Math.sqrt(3) * PR) * gap;
    arr.push({
      id: "outer" + i,
      x: CX + Math.cos(a) * rd,
      y: CY + Math.sin(a) * rd,
      vx: 0, vy: 0,
      type: i % 2 === 0 ? "black" : "white",
      pocketed: false, sinking: false, sinkScale: 1,
    });
  }
  return arr;
}

function wallBounce(p) {
  if (p.x - PR < BOUNDS.L) { p.x = BOUNDS.L + PR; p.vx = Math.abs(p.vx) * RESTITUTION; }
  if (p.x + PR > BOUNDS.R) { p.x = BOUNDS.R - PR; p.vx = -Math.abs(p.vx) * RESTITUTION; }
  if (p.y - PR < BOUNDS.T) { p.y = BOUNDS.T + PR; p.vy = Math.abs(p.vy) * RESTITUTION; }
  if (p.y + PR > BOUNDS.B) { p.y = BOUNDS.B - PR; p.vy = -Math.abs(p.vy) * RESTITUTION; }
}

function strikerWallBounce(p) {
  if (p.x - SR < BOUNDS.L) { p.x = BOUNDS.L + SR; p.vx = Math.abs(p.vx) * RESTITUTION; }
  if (p.x + SR > BOUNDS.R) { p.x = BOUNDS.R - SR; p.vx = -Math.abs(p.vx) * RESTITUTION; }
  if (p.y - SR < BOUNDS.T) { p.y = BOUNDS.T + SR; p.vy = Math.abs(p.vy) * RESTITUTION; }
  if (p.y + SR > BOUNDS.B) { p.y = BOUNDS.B - SR; p.vy = -Math.abs(p.vy) * RESTITUTION; }
}

function circleCollide(a, b) {
  if (a.pocketed || b.pocketed) return;
  const ra = a.isStriker ? SR : PR;
  const rb = b.isStriker ? SR : PR;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = ra + rb;
  if (d < minD && d > 0.01) {
    const nx = dx / d, ny = dy / d;
    const overlap = (minD - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
    const dot = dvx * nx + dvy * ny;
    if (dot > 0) {
      const imp = dot * (1 + RESTITUTION) / 2;
      a.vx -= imp * nx; a.vy -= imp * ny;
      b.vx += imp * nx; b.vy += imp * ny;
    }
  }
}

// ─── BOARD DRAWING (ZIKE style) ──────────────────────────────────────────────
function drawBoard(ctx) {
  function arrow(x, y, angle, len = 10) {
    const s = 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * Math.cos(angle - s), y - len * Math.sin(angle - s));
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * Math.cos(angle + s), y - len * Math.sin(angle + s));
    ctx.stroke();
  }

  function redDot(x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#e3242b"; ctx.fill();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // 1. Outer frame (Dark grey/black)
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, BASE, BASE);

  // Striped corners for pockets
  for (let i = 0; i < 4; i++) {
    const px = POCKETS[i].x === FRAME ? 0 : BASE - FRAME;
    const py = POCKETS[i].y === FRAME ? 0 : BASE - FRAME;
    ctx.fillStyle = "#888";
    ctx.fillRect(px, py, FRAME, FRAME);
    ctx.strokeStyle = "#555"; ctx.lineWidth = 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, FRAME, FRAME); ctx.clip();
    for (let j = -FRAME; j < FRAME * 2; j += 6) {
      ctx.beginPath(); ctx.moveTo(px + j, py); ctx.lineTo(px + j + FRAME, py + FRAME); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + j, py + FRAME); ctx.lineTo(px + j + FRAME, py); ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Light birch wood surface
  const wg = ctx.createLinearGradient(FRAME, FRAME, BASE - FRAME, BASE - FRAME);
  wg.addColorStop(0, "#f6deaf");
  wg.addColorStop(0.5, "#ebd19d");
  wg.addColorStop(1, "#dfc28a");
  ctx.fillStyle = wg;
  ctx.fillRect(FRAME, FRAME, INNER, INNER);

  // Thin bounding box just inside the wood
  ctx.strokeStyle = "#111"; ctx.lineWidth = 1;
  ctx.strokeRect(FRAME + 6, FRAME + 6, INNER - 12, INNER - 12);

  // 3. Pockets - the holes cut into the wood
  POCKETS.forEach((pk) => {
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, POCKET_R, 0, Math.PI * 2);
    ctx.fillStyle = "#111"; ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
    for (let i = -POCKET_R; i <= POCKET_R; i += 4) {
      ctx.beginPath(); ctx.moveTo(pk.x + i, pk.y - POCKET_R); ctx.lineTo(pk.x + i, pk.y + POCKET_R); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pk.x - POCKET_R, pk.y + i); ctx.lineTo(pk.x + POCKET_R, pk.y + i); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(pk.x, pk.y, POCKET_R, 0, Math.PI * 2);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.stroke();
  });

  // 4. Baseline disconnected tracks with double red dots and corner circle
  const trackW = 15;
  const blOff = SR * 3.2; // 59.5
  const sqL = FRAME + blOff, sqR = BASE - FRAME - blOff; // 113.5 and 486.5
  const sqT = sqL, sqB = sqR;
  const rdOff = 26; // Offset from the corner to the red dot center

  function drawTrack(cx1, cy1, cx2, cy2) {
    const dx = cx2 - cx1, dy = cy2 - cy1;
    const len = Math.hypot(dx, dy);
    const nx = dx / len, ny = dy / len;
    const px = -ny * trackW, py = nx * trackW;

    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.6;

    ctx.beginPath(); ctx.moveTo(cx1 + px, cy1 + py); ctx.lineTo(cx2 + px, cy2 + py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx1 - px, cy1 - py); ctx.lineTo(cx2 - px, cy2 - py); ctx.stroke();

    redDot(cx1, cy1, trackW);
    redDot(cx2, cy2, trackW);
  }

  drawTrack(sqL + rdOff, sqT, sqR - rdOff, sqT); // Top
  drawTrack(sqL + rdOff, sqB, sqR - rdOff, sqB); // Bottom
  drawTrack(sqL, sqT + rdOff, sqL, sqB - rdOff); // Left
  drawTrack(sqR, sqT + rdOff, sqR, sqB - rdOff); // Right

  // 4 Corners: small circle, diagonal line, arrow, and C-curve
  [
    [sqL, sqT, Math.PI / 4],       // TL: points to bottom-right (center)
    [sqR, sqT, Math.PI * 3 / 4],     // TR: points to bottom-left
    [sqR, sqB, Math.PI * 5 / 4],     // BR: points to top-left
    [sqL, sqB, -Math.PI / 4]       // BL: points to top-right
  ].forEach(([cx, cy, angleIn]) => {
    // Corner small unfilled circle
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke();

    const angleOut = angleIn + Math.PI;

    // Diagonal lines (outwards to pocket, onwards ending EXACTLY at the center of the arc belly)
    const dist = 90;
    const hr = 28;

    const pxOut = cx + Math.cos(angleOut) * 38;
    const pyOut = cy + Math.sin(angleOut) * 38;
    const pxIn = cx + Math.cos(angleIn) * (dist + hr);
    const pyIn = cy + Math.sin(angleIn) * (dist + hr);

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angleOut) * 6, cy + Math.sin(angleOut) * 6);
    ctx.lineTo(pxOut, pyOut);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angleIn) * 6, cy + Math.sin(angleIn) * 6);
    ctx.lineTo(pxIn, pyIn);
    ctx.stroke();

    // 180-degree semi-circle "umbrella" curve
    const hcx = cx + Math.cos(angleIn) * dist;
    const hcy = cy + Math.sin(angleIn) * dist;

    ctx.beginPath();
    ctx.arc(hcx, hcy, hr, angleIn - Math.PI / 2, angleIn + Math.PI / 2);
    ctx.stroke();
  });

  // 5. Center design
  const mainR = INNER * 0.18;
  const innerR = 18;
  ctx.beginPath(); ctx.arc(CX, CY, mainR, 0, Math.PI * 2);
  ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke();

  // Star points
  const pM = mainR * 0.85;
  const pm = mainR * 0.55;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    // Major Red
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * innerR, CY + Math.sin(a) * innerR);
    ctx.lineTo(CX + Math.cos(a) * pM, CY + Math.sin(a) * pM);
    ctx.lineTo(CX + Math.cos(a + 0.3) * innerR, CY + Math.sin(a + 0.3) * innerR);
    ctx.fillStyle = "#e3242b"; ctx.fill(); ctx.stroke();
    // Major Black
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * innerR, CY + Math.sin(a) * innerR);
    ctx.lineTo(CX + Math.cos(a) * pM, CY + Math.sin(a) * pM);
    ctx.lineTo(CX + Math.cos(a - 0.3) * innerR, CY + Math.sin(a - 0.3) * innerR);
    ctx.fillStyle = "#111"; ctx.fill(); ctx.stroke();
    // Minor Black
    const aMin = a + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(aMin - 0.12) * innerR, CY + Math.sin(aMin - 0.12) * innerR);
    ctx.lineTo(CX + Math.cos(aMin) * pm, CY + Math.sin(aMin) * pm);
    ctx.lineTo(CX + Math.cos(aMin + 0.12) * innerR, CY + Math.sin(aMin + 0.12) * innerR);
    ctx.fillStyle = "#111"; ctx.fill(); ctx.stroke();
  }

  // Inner black ring
  ctx.beginPath(); ctx.arc(CX, CY, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke();

  // Center red dot
  redDot(CX, CY, 9);

  // 6. Labels removed.

  ctx.save();
  ctx.font = "bold 9px sans-serif"; ctx.fillStyle = "#111";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.translate(FRAME + 25, CY); ctx.rotate(-Math.PI / 2);
  ctx.fillText("MADE IN INDIA", 0, 0);
  ctx.restore();
}

// ─── PIECE DRAWING ────────────────────────────────────────────────────────────
function drawPiece(ctx, p) {
  if (p.pocketed && p.sinkScale <= 0.04) return;
  const sc = p.sinkScale ?? 1;
  const r = PR * sc;
  if (r < 0.5) return;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(sc, sc);

  // Shadow
  ctx.beginPath();
  ctx.arc(1.5, 2, PR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  if (p.type === "queen") {
    // Red/pink queen
    const g = ctx.createRadialGradient(-PR * 0.3, -PR * 0.3, 1, 0, 0, PR);
    g.addColorStop(0, "#ff6666");
    g.addColorStop(0.5, "#cc1111");
    g.addColorStop(1, "#880000");
    ctx.beginPath(); ctx.arc(0, 0, PR, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "#660000"; ctx.lineWidth = 1; ctx.stroke();

    // Inner ring
    ctx.beginPath(); ctx.arc(0, 0, PR * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,200,200,0.5)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, PR * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,150,150,0.8)"; ctx.fill();

  } else if (p.type === "white") {
    // Beige/cream coin (like real carrom - not pure white)
    const g = ctx.createRadialGradient(-PR * 0.3, -PR * 0.35, 1, 0, 0, PR);
    g.addColorStop(0, "#f5e8c8");
    g.addColorStop(0.6, "#d4b882");
    g.addColorStop(1, "#b89050");
    ctx.beginPath(); ctx.arc(0, 0, PR, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "#8a6028"; ctx.lineWidth = 1; ctx.stroke();

    // Inner circle ring
    ctx.beginPath(); ctx.arc(0, 0, PR * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100,60,10,0.4)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, PR * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,160,80,0.6)"; ctx.fill();

  } else {
    // Black coin
    const g = ctx.createRadialGradient(-PR * 0.3, -PR * 0.35, 1, 0, 0, PR);
    g.addColorStop(0, "#444");
    g.addColorStop(0.6, "#1a1a1a");
    g.addColorStop(1, "#050505");
    ctx.beginPath(); ctx.arc(0, 0, PR, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke();

    // Inner ring
    ctx.beginPath(); ctx.arc(0, 0, PR * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100,100,100,0.4)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, PR * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(80,80,80,0.6)"; ctx.fill();
  }

  // Highlight
  ctx.beginPath();
  ctx.arc(-PR * 0.28, -PR * 0.32, PR * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.fill();

  ctx.restore();
}

function drawStriker(ctx, s) {
  if (s.pocketed && s.sinkScale <= 0.04) return;
  const sc = s.sinkScale ?? 1;
  if (sc < 0.04) return;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(sc, sc);

  ctx.beginPath(); ctx.arc(1.5, 2, SR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fill();

  // Striker is larger, white/cream colored
  const g = ctx.createRadialGradient(-SR * 0.25, -SR * 0.3, 2, 0, 0, SR);
  g.addColorStop(0, "#fffff0");
  g.addColorStop(0.5, "#e8e0c8");
  g.addColorStop(1, "#c0b080");
  ctx.beginPath(); ctx.arc(0, 0, SR, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = "#8a7040"; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.beginPath(); ctx.arc(0, 0, SR * 0.58, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(100,80,20,0.4)"; ctx.lineWidth = 1; ctx.stroke();

  ctx.beginPath(); ctx.arc(-SR * 0.28, -SR * 0.3, SR * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();

  ctx.restore();
}

function drawAimGuide(ctx, striker, aimAngle, power) {
  ctx.save();
  const cos = Math.cos(aimAngle);
  const sin = Math.sin(aimAngle);
  const powerFrac = power / 100;

  const numDots = 14;
  const dotSpacing = BASE * 0.042;
  for (let i = 1; i <= numDots; i++) {
    const fade = 1 - i / (numDots + 1);
    const alpha = fade * 0.85 * (0.4 + powerFrac * 0.6);
    const dotR = 2.5 * fade;
    ctx.beginPath();
    ctx.arc(striker.x + cos * dotSpacing * i, striker.y + sin * dotSpacing * i, dotR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,200,${alpha})`;
    ctx.fill();
  }

  const arrowDist = dotSpacing * numDots;
  const ax = striker.x + cos * arrowDist;
  const ay = striker.y + sin * arrowDist;
  const headLen = 10, spread = Math.PI / 6;
  ctx.strokeStyle = `rgba(255,255,200,${0.6 + powerFrac * 0.35})`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ax - cos * headLen * 1.4, ay - sin * headLen * 1.4);
  ctx.lineTo(ax, ay); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - headLen * Math.cos(aimAngle - spread), ay - headLen * Math.sin(aimAngle - spread));
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - headLen * Math.cos(aimAngle + spread), ay - headLen * Math.sin(aimAngle + spread));
  ctx.stroke();

  if (power > 3) {
    const pd = powerFrac * BASE * 0.26;
    ctx.lineWidth = 7;
    ctx.strokeStyle = `rgba(255,120,0,${0.1 + powerFrac * 0.18})`;
    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(striker.x - cos * pd, striker.y - sin * pd);
    ctx.stroke();
    const r = Math.min(255, Math.round(255 * powerFrac));
    const g = Math.max(0, Math.round(220 - 200 * powerFrac));
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = `rgba(${r},${g},0,${0.55 + powerFrac * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(striker.x - cos * pd, striker.y - sin * pd);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(striker.x - cos * pd, striker.y - sin * pd, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,220,80,${0.7 + powerFrac * 0.3})`;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(striker.x, striker.y, SR + 6, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,220,80,${0.2 + powerFrac * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function getValidStrikerX(desiredX, gs) {
  if (!gs || !gs.striker) return desiredX;
  const minX = FRAME + SR * 3.2 + 26;
  const maxX = BASE - FRAME - SR * 3.2 - 26;

  // Use a simple array for valid segments: {min, max}
  let valid = [{ min: minX, max: maxX }];

  gs.pieces.forEach(p => {
    if (p.pocketed) return;
    const dy = p.y - gs.striker.y;
    const minDist = SR + PR + 1.5;
    if (Math.abs(dy) < minDist) {
      const dx = Math.sqrt(minDist * minDist - dy * dy);
      const bMin = p.x - dx;
      const bMax = p.x + dx;

      const nextValid = [];
      valid.forEach(v => {
        if (bMax <= v.min || bMin >= v.max) {
          nextValid.push(v);
        } else {
          if (v.min < bMin) nextValid.push({ min: v.min, max: bMin });
          if (bMax < v.max) nextValid.push({ min: bMax, max: v.max });
        }
      });
      valid = nextValid;
    }
  });

  if (valid.length === 0) return clamp(desiredX, minX, maxX);

  let bestX = desiredX;
  let minErr = Infinity;
  valid.forEach(v => {
    let cand = clamp(desiredX, v.min, v.max);
    let err = Math.abs(desiredX - cand);
    if (err < minErr) {
      minErr = err;
      bestX = cand;
    }
  });
  return bestX;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function CarromGame() {
  const canvasRef = useRef(null);
  const gsRef = useRef(null);
  const rafRef = useRef(null);
  const aiTimerRef = useRef(null);
  const resolveTimerRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const sliderRef = useRef(null);

  const [screen, setScreen] = useState("menu");
  const [uiTurn, setUiTurn] = useState(0);
  const [uiScores, setUiScores] = useState({ w: 9, b: 9 });
  const [uiQueenOwner, setUiQueenOwner] = useState(-1);
  const [uiPower, setUiPower] = useState(0);
  const [uiStatus, setUiStatus] = useState("");
  const [uiWinner, setUiWinner] = useState({ player: "", pts: 0 });
  const [gameMode, setGameMode] = useState("pvp");

  const getBaseY = (t) => (t === 0 ? BASE - FRAME - SR * 3.2 : FRAME + SR * 3.2);

  const resetStriker = useCallback((gs, t, offX = 0) => {
    gs.striker = {
      x: CX + offX, y: getBaseY(t),
      vx: 0, vy: 0,
      pocketed: false, sinking: false, sinkScale: 1,
      isStriker: true,
    };
    gs.striker.x = getValidStrikerX(gs.striker.x, gs);
  }, []);

  const returnQueen = useCallback((gs) => {
    const q = gs.pieces.find((p) => p.type === "queen");
    if (q) {
      q.x = CX; q.y = CY; q.vx = 0; q.vy = 0;
      q.pocketed = false; q.sinking = false; q.sinkScale = 1;
    }
    gs.queenOut = true;
    gs.queenPendingCoverBy = -1;
    gs.queenOwner = -1;
  }, []);

  const endGame = useCallback((winner) => {
    const gs = gsRef.current;
    if (!gs) return;

    let points = gs.pieces.filter(p => !p.pocketed && p.type === (winner === 0 ? "black" : "white")).length;
    if (gs.queenOwner === winner) points += 5; // Queen points

    gs.phase = "gameover";
    setUiWinner({ player: winner === 0 ? "Beige" : "Black", pts: points });
    setScreen("gameover");
  }, []);

  const shoot = useCallback(() => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim") return;
    const spd = gs.power * 0.55;
    gs.striker.vx = Math.cos(gs.aimAngle) * spd;
    gs.striker.vy = Math.sin(gs.aimAngle) * spd;
    gs.striker.pocketed = false;
    gs.phase = "rolling";
    gs.power = 0;
    gs.dragMode = null;
    setUiPower(0);
  }, []);

  const doAI = useCallback(() => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim" || gs.turn !== 1) return;
    const targets = gs.pieces.filter((p) => !p.pocketed && p.type === "black");
    if (!targets.length) return;
    const t = targets[Math.floor(Math.random() * targets.length)];
    const jitter = (Math.random() - 0.5) * PR * 5;
    const minX = FRAME + SR * 3.2 + 26;
    const maxX = BASE - FRAME - SR * 3.2 - 26;
    const nx = clamp(t.x + jitter, minX, maxX);
    gs.strikerOffsetX = nx - CX;
    resetStriker(gs, 1, gs.strikerOffsetX);
    gs.aimAngle = Math.atan2(t.y - gs.striker.y, t.x - gs.striker.x);
    gs.power = 35 + Math.random() * 55;
    setUiPower(gs.power);
    aiTimerRef.current = setTimeout(() => {
      if (gsRef.current?.phase === "aim") shoot();
    }, 550);
  }, [resetStriker, shoot]);

  const resolveTurn = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;

    let wr = gs.pieces.filter((p) => !p.pocketed && p.type === "white").length;
    let br = gs.pieces.filter((p) => !p.pocketed && p.type === "black").length;
    const queenPiece = gs.pieces.find((p) => p.type === "queen");

    const wJustPocketed = gs.wPrev - wr;
    const bJustPocketed = gs.bPrev - br;
    const queenJustPocketed = gs.queenOut && queenPiece && queenPiece.pocketed;

    const myType = gs.turn === 0 ? "white" : "black";
    const oppType = gs.turn === 0 ? "black" : "white";

    let myPocketed = gs.turn === 0 ? wJustPocketed : bJustPocketed;
    let oppPocketed = gs.turn === 0 ? bJustPocketed : wJustPocketed;

    let switchTurn = false, msg = "", foul = false;

    // Helper to physically return coins
    const returnCoins = (type, count, scatter) => {
      let returned = 0;
      const pocketedList = gs.pieces.filter(p => p.type === type && p.pocketed);
      for (let i = 0; i < Math.min(count, pocketedList.length); i++) {
        const c = pocketedList[i];
        c.x = CX + (scatter ? (Math.random() - 0.5) * 40 : 0);
        c.y = CY + (scatter ? (Math.random() - 0.5) * 40 : 0);
        c.vx = 0; c.vy = 0;
        c.pocketed = false; c.sinking = false; c.sinkScale = 1;
        returned++;
      }
      return returned;
    };

    if (gs.striker.pocketed) {
      foul = true; switchTurn = true;
      msg = "⚡ Foul! Striker pocketed.";
      const ret = returnCoins(myType, 1, false);
      if (ret > 0) {
        msg += " Penalty: 1 coin back.";
        myPocketed = Math.max(0, myPocketed - 1);
        if (gs.turn === 0) wr++; else br++;
      }
    }

    if (oppPocketed > 0) {
      switchTurn = true;
      msg += (msg ? " " : "") + "⚠️ Opponent's coin pocketed.";
      const ret = returnCoins(oppType, oppPocketed, true);
      if (ret > 0) {
        msg += " Returned to board.";
        if (gs.turn === 0) br += ret; else wr += ret;
      }
      oppPocketed = 0;
    }

    if (gs.queenPendingCoverBy === gs.turn) {
      if (myPocketed > 0 && !foul) {
        gs.queenPendingCoverBy = -1;
        gs.queenOwner = gs.turn;
        msg = "♛ Queen COVERED!" + (msg ? " " + msg : "");
      } else {
        gs.queenPendingCoverBy = -1; returnQueen(gs);
        msg = "❌ Cover failed! Queen returned." + (msg ? " " + msg : "");
        switchTurn = true;
      }
    } else if (queenJustPocketed) {
      if (foul) {
        returnQueen(gs); msg += " ❌ Queen returned.";
      } else if (myPocketed > 0 && oppPocketed === 0) {
        gs.queenOut = false; gs.queenPendingCoverBy = -1; gs.queenOwner = gs.turn; switchTurn = false;
        msg = "♛ Queen pocketed & COVERED!";
      } else {
        gs.queenOut = false; gs.queenPendingCoverBy = gs.turn; switchTurn = false;
        msg = "♛ Queen pocketed! Cover next shot.";
      }
    } else {
      if (!switchTurn) {
        if (myPocketed > 0) { msg = "✅ Good shot! Go again."; switchTurn = false; }
        else if (!foul) { switchTurn = true; msg = "No coins pocketed."; }
      }
    }

    let win = -1;
    if (wr === 0 && (!gs.queenOut && gs.queenPendingCoverBy !== 0)) win = 0;
    if (br === 0 && (!gs.queenOut && gs.queenPendingCoverBy !== 1)) win = 1;

    if (win === -1 && wr === 0) {
      const ret = returnCoins("white", 1, false);
      if (ret) { wr++; msg = "❌ Last coin pocketed without Queen! 1 returned."; switchTurn = true; }
    }
    if (win === -1 && br === 0) {
      const ret = returnCoins("black", 1, false);
      if (ret) { br++; msg = "❌ Last coin pocketed without Queen! 1 returned."; switchTurn = true; }
    }

    gs.wPrev = wr; gs.bPrev = br;
    setUiScores({ w: wr, b: br });
    setUiQueenOwner(gs.queenOwner !== undefined ? gs.queenOwner : -1);
    setUiStatus(msg.trim());

    if (win !== -1) {
      endGame(win);
      return;
    }

    resolveTimerRef.current = setTimeout(() => {
      const g = gsRef.current;
      if (!g || g.phase === "gameover") return;
      const nextTurn = switchTurn ? 1 - g.turn : g.turn;
      g.turn = nextTurn;
      g.strikerOffsetX = 0;
      resetStriker(g, nextTurn, 0);
      g.phase = "aim";
      g.aimAngle = nextTurn === 0 ? -Math.PI / 2 : Math.PI / 2;
      g.power = 0;
      g.resolving = false;
      g.dragMode = null;
      setUiPower(0);
      setUiTurn(nextTurn);
      setUiStatus(nextTurn === 0 ? "Beige's turn — drag to aim" : "Black's turn — drag to aim");
      if (gameMode === "pvc" && nextTurn === 1) aiTimerRef.current = setTimeout(doAI, 900);
    }, 750);
  }, [endGame, returnQueen, resetStriker, doAI, gameMode]);

  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const loop = () => {
      const gs = gsRef.current;
      if (!gs) return;
      const ctx = canvas.getContext("2d");

      if (gs.phase === "rolling") {
        const fr = Math.pow(FRICTION, 1 / 8);
        const all = [gs.striker, ...gs.pieces];
        const active = all.filter((p) => !p.pocketed);

        for (let s = 0; s < 8; s++) {
          active.forEach((p) => {
            p.x += p.vx / 8; p.y += p.vy / 8;
            p.vx *= fr; p.vy *= fr;
            let pocketGravity = false, pullX = 0, pullY = 0, insidePocket = false;

            POCKETS.forEach((pk) => {
              const d = Math.hypot(p.x - pk.x, p.y - pk.y);
              if (d < POCKET_R) { pocketGravity = true; pullX = (pk.x - p.x) * 0.08; pullY = (pk.y - p.y) * 0.08; }
              if (d < POCKET_R * 0.5) insidePocket = true;
            });

            if (pocketGravity) { p.x += pullX; p.y += pullY; }
            else { if (p.isStriker) strikerWallBounce(p); else wallBounce(p); }

            if (!p.pocketed && insidePocket) { p.pocketed = true; p.sinking = true; p.sinkScale = 1.0; }
          });
          for (let i = 0; i < active.length; i++)
            for (let j = i + 1; j < active.length; j++)
              circleCollide(active[i], active[j]);
        }

        all.forEach((p) => {
          if (p.sinking && p.sinkScale > 0.04) {
            const pk = nearestPocket(p);
            if (pk) { p.x += (pk.x - p.x) * 0.18; p.y += (pk.y - p.y) * 0.18; }
            p.sinkScale *= 0.82;
            if (p.sinkScale < 0.04) p.sinkScale = 0;
          }
        });

        const moving = active.filter((p) => Math.hypot(p.vx, p.vy) > MIN_V);
        const sinking = all.filter((p) => p.sinking && p.sinkScale > 0.04);
        if (moving.length === 0 && sinking.length === 0 && !gs.resolving) {
          gs.resolving = true;
          resolveTimerRef.current = setTimeout(resolveTurn, 500);
        }
      }

      if (sliderRef.current && gs.phase === "aim") {
        sliderRef.current.value = gs.striker.x;
      }

      // Render
      if (!bgCanvasRef.current) {
        const bc = document.createElement("canvas");
        bc.width = BASE; bc.height = BASE;
        const bctx = bc.getContext("2d", { alpha: false });
        drawBoard(bctx);
        bgCanvasRef.current = bc;
      }
      ctx.drawImage(bgCanvasRef.current, 0, 0);

      if (gs.phase === "aim" && !(gameMode === "pvc" && gs.turn === 1)) {
        drawAimGuide(ctx, gs.striker, gs.aimAngle, gs.power);
      }

      gs.pieces.forEach((p) => drawPiece(ctx, p));
      drawStriker(ctx, gs.striker);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, resolveTurn, gameMode]);

  const getXY = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scl = BASE / rect.width;
    const cl = e.touches ? e.touches[0] : e;
    return { x: (cl.clientX - rect.left) * scl, y: (cl.clientY - rect.top) * scl };
  }, []);

  const handleSliderChange = useCallback((e) => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim") return;
    if (gameMode === "pvc" && gs.turn === 1) return;
    const val = parseFloat(e.target.value);
    const nx = getValidStrikerX(val, gs);
    gs.strikerOffsetX = nx - CX;
    gs.striker.x = nx;
    if (Math.abs(val - nx) > 0.1) e.target.value = nx;
  }, [gameMode]);

  const handlePointerDown = useCallback((e) => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim") return;
    if (gameMode === "pvc" && gs.turn === 1) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    gs.dragMode = "aim";
  }, [gameMode]);

  const handlePointerMove = useCallback((e) => {
    const gs = gsRef.current;
    if (!gs || !gs.dragMode || gs.phase !== "aim") return;
    const { x, y } = getXY(e);
    const dx = gs.striker.x - x, dy = gs.striker.y - y;
    gs.aimAngle = Math.atan2(dy, dx);
    gs.power = clamp(Math.hypot(dx, dy) * 0.72, 0, 100);
    setUiPower(gs.power);
  }, [getXY]);

  const handlePointerUp = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    if (gs.dragMode === "aim" && gs.power > 10 && gs.phase === "aim") shoot();
    gs.dragMode = null; gs.power = 0;
    setUiPower(0);
  }, [shoot]);

  const startGame = useCallback((mode) => {
    clearTimeout(aiTimerRef.current);
    clearTimeout(resolveTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    bgCanvasRef.current = null;

    const pieces = createPieces();
    gsRef.current = {
      pieces, striker: {}, phase: "aim", turn: 0,
      aimAngle: -Math.PI / 2, power: 0, strikerOffsetX: 0,
      dragMode: null, resolving: false, queenOut: true,
      queenPendingCoverBy: -1, queenOwner: -1, wPrev: 9, bPrev: 9,
    };
    resetStriker(gsRef.current, 0, 0);

    setGameMode(mode);
    setUiTurn(0); setUiScores({ w: 9, b: 9 });
    setUiQueenOwner(-1);
    setUiPower(0); setUiStatus("Beige's turn — drag to aim");
    setUiWinner({ player: "", pts: 0 }); setScreen("game");
  }, [resetStriker]);

  const goMenu = useCallback(() => {
    clearTimeout(aiTimerRef.current);
    clearTimeout(resolveTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    setScreen("menu");
  }, []);

  const powerPct = Math.round(uiPower);
  const powerColor = powerPct < 40 ? "#44dd44" : powerPct < 65 ? "#ffcc00" : "#ff4400";
  const isAITurn = gameMode === "pvc" && uiTurn === 1;

  // ── MENU ──
  if (screen === "menu") {
    return (
      <div style={s.root}>
        <style>{globalCss}</style>
        <div style={s.menuWrap}>
          <div style={{ ...s.brandRow, marginBottom: 0 }}>
            <svg width="84" height="84" viewBox="0 0 100 100" style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}>
              <defs>
                <radialGradient id="gradWhite" cx="30%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#f5e8c8" />
                  <stop offset="60%" stopColor="#d4b882" />
                  <stop offset="100%" stopColor="#b89050" />
                </radialGradient>
                <radialGradient id="gradBlack" cx="30%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#555" />
                  <stop offset="60%" stopColor="#222" />
                  <stop offset="100%" stopColor="#0a0a0a" />
                </radialGradient>
                <radialGradient id="gradRed" cx="30%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#ff6666" />
                  <stop offset="50%" stopColor="#cc1111" />
                  <stop offset="100%" stopColor="#880000" />
                </radialGradient>
              </defs>

              {/* White Coin (Left) */}
              <g transform="translate(28, 38)">
                <circle cx="0" cy="0" r="22" fill="url(#gradWhite)" stroke="#8a6028" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="14" stroke="rgba(100,60,10,0.4)" strokeWidth="1.5" fill="none" />
                <circle cx="0" cy="0" r="5" fill="rgba(200,160,80,0.6)" />
                <circle cx="-6" cy="-7" r="3" fill="rgba(255,255,255,0.5)" />
              </g>

              {/* Black Coin (Right) */}
              <g transform="translate(72, 38)">
                <circle cx="0" cy="0" r="22" fill="url(#gradBlack)" stroke="#000" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="14" stroke="rgba(100,100,100,0.4)" strokeWidth="1.5" fill="none" />
                <circle cx="0" cy="0" r="5" fill="rgba(80,80,80,0.6)" />
                <circle cx="-6" cy="-7" r="3" fill="rgba(255,255,255,0.3)" />
              </g>

              {/* Red Queen (Center/Bottom overlap) */}
              <g transform="translate(50, 68)">
                <circle cx="0" cy="0" r="22" fill="url(#gradRed)" stroke="#660000" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="14" stroke="rgba(255,200,200,0.5)" strokeWidth="1.5" fill="none" />
                <circle cx="0" cy="0" r="5" fill="rgba(255,150,150,0.8)" />
                <circle cx="-6" cy="-7" r="3" fill="rgba(255,255,255,0.5)" />
              </g>
            </svg>
          </div>
          <h1 style={s.menuTitle}>CARROM</h1>
          <p style={s.menuSub}>Classic Board Game · Made in India</p>
          <div style={s.btnGroup}>
            <button style={s.primaryBtn} onClick={() => startGame("pvp")}>
              👥 Two Players
            </button>
            <button style={s.secBtn} onClick={() => startGame("pvc")}>
              🤖 vs Computer
            </button>
          </div>
          <div style={s.rulesBox}>
            <div style={s.rulesTitle}>HOW TO PLAY</div>
            {[
              "Pocket your coins to get another turn",
              "Pocket the Queen anytime, then cover it next shot",
              "Queen Penalty: If not covered, Queen goes back",
              "Striker Foul: Lose 1 pocketed coin",
              "Opponent Hit Foul: Coin is returned to board",
              "First to finish their coins safely wins the board!",
            ].map((rule, i) => (
              <div key={i} style={s.ruleItem}><span style={s.ruleDot}>▸</span>{rule}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── GAME OVER ──
  if (screen === "gameover") {
    return (
      <div style={s.root}>
        <style>{globalCss}</style>
        <div style={s.menuWrap}>
          <div style={s.trophy}>🏆</div>
          <div style={s.goTitle}>{uiWinner.player} Wins!</div>
          <div style={s.goSub}>Reward: {uiWinner.pts} points based on remaining coins & queen rules!</div>
          <div style={s.finalScore}>
            <div style={s.fsBox}><div style={s.fsLabel}>BEIGE</div><div style={s.fsNum}>{uiScores.w}</div><div style={s.fsHint}>left</div></div>
            <div style={s.fsDivider} />
            <div style={s.fsBox}><div style={s.fsLabel}>BLACK</div><div style={s.fsNum}>{uiScores.b}</div><div style={s.fsHint}>left</div></div>
          </div>
          <button style={{ ...s.primaryBtn, maxWidth: 240 }} onClick={() => startGame(gameMode)}>Play Again</button>
          <button style={{ ...s.secBtn, maxWidth: 240, marginTop: 8 }} onClick={goMenu}>Main Menu</button>
        </div>
      </div>
    );
  }

  // ── GAME ──
  return (
    <div style={s.root}>
      <style>{globalCss}</style>
      <div style={s.gameWrap}>
        <div style={s.header}>
          <button style={s.menuBtn} onClick={goMenu}>← MENU</button>
          <span style={s.headerTitle}>CARROM</span>
          <span style={s.modeTag}>{gameMode === "pvc" ? "🤖 vs AI" : "👥 2P"}</span>
        </div>

        <div style={s.scorebar}>
          <div style={{ ...s.scoreBox, ...(uiTurn === 0 ? s.scoreActive : {}) }}>
            <div style={s.scoreCircle} />
            <div style={{...s.scoreLabel, display:"flex", alignItems:"center", gap:2}}>
              BEIGE {uiQueenOwner === 0 && <span style={{color:"#ff4444", fontSize:10}}>♛</span>}
            </div>
            <div style={s.scoreNum}>{uiScores.w}</div>
          </div>

          <div style={s.centerInfo}>
            <div style={s.turnText}>
              {isAITurn ? "🤖 AI thinking…" : gameMode === "pvc" ? "Your Turn" : uiTurn === 0 ? "Beige's Turn" : "Black's Turn"}
            </div>
            <div style={s.powerTrack}>
              <div style={{ ...s.powerFill, width: `${powerPct}%`, background: powerColor }} />
            </div>
            <div style={s.powerLabel}>{powerPct > 0 ? `Power ${powerPct}%` : "·"}</div>
          </div>

          <div style={{ ...s.scoreBox, ...(uiTurn === 1 ? s.scoreActive : {}) }}>
            <div style={{ ...s.scoreCircle, background: "#1a1a1a", border: "1px solid #555" }} />
            <div style={{...s.scoreLabel, display:"flex", alignItems:"center", gap:2}}>
              {uiQueenOwner === 1 && <span style={{color:"#ff4444", fontSize:10}}>♛</span>} BLACK
            </div>
            <div style={s.scoreNum}>{uiScores.b}</div>
          </div>
        </div>

        <div style={s.canvasWrap}>
          <canvas
            ref={canvasRef}
            width={BASE}
            height={BASE}
            style={s.canvas}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        <div style={{ ...s.sliderWrap, ...(isAITurn || powerPct > 0 ? { opacity: 0.3, pointerEvents: "none" } : {}) }}>
          <div style={s.sliderIcon}>◄</div>
          <input
            ref={sliderRef}
            type="range"
            min={FRAME + SR * 3.2 + 26}
            max={BASE - FRAME - SR * 3.2 - 26}
            step="0.1"
            defaultValue={CX}
            onChange={handleSliderChange}
            onInput={handleSliderChange}
            style={s.positionSlider}
          />
          <div style={s.sliderIcon}>►</div>
        </div>

        <div style={s.statusBar}>{uiStatus || "\u00A0"}</div>
        <div style={s.hint}>Move line to position · Pull back on board to shoot</div>
      </div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;700&family=Bebas+Neue&display=swap');
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; position:fixed; touch-action:none; }
  #root { height:100%; }
  button { outline:none; }
  button:hover { filter: brightness(1.1); }
  button:active { filter: brightness(0.9); }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 28px; height: 28px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fffff0, #c0b080);
    border: 3px solid #8a7040;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.9);
  }
  input[type=range]::-moz-range-thumb {
    width: 28px; height: 28px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fffff0, #c0b080);
    border: 3px solid #8a7040;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.9);
  }
`;

const s = {
  sliderWrap: {
    display: "flex", alignItems: "center", gap: 12,
    width: "100%", padding: "6px 16px", marginTop: 2,
    background: "rgba(0,0,0,0.5)", borderRadius: 8,
    transition: "opacity 0.2s", flexShrink: 0,
  },
  sliderIcon: { fontSize: 13, color: "#8a7040" },
  positionSlider: {
    flex: 1, WebkitAppearance: "none", appearance: "none",
    height: 8, background: "#111", borderRadius: 4, outline: "none",
    border: "1px solid #333", cursor: "pointer",
  },
  root: {
    width: "100vw", height: "100dvh",
    background: "linear-gradient(160deg,#1a1a1a 0%,#0d0d0d 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Rajdhani', sans-serif",
    color: "#f0e8d0",
    padding: "clamp(4px,1.5vw,12px)",
    overflow: "hidden",
  },
  menuWrap: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 6, maxWidth: 340, width: "100%",
  },
  boardPreview: {
    width: 70, height: 70, background: "#e8d498",
    border: "6px solid #111", borderRadius: 4,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
  },
  bpInner: {
    width: 52, height: 52,
    display: "grid", gridTemplate: "repeat(3,1fr) / repeat(3,1fr)",
    alignItems: "center", justifyItems: "center",
  },
  bpCorner: {
    width: 12, height: 12, borderRadius: "50%",
    background: "radial-gradient(circle at 35% 35%, #ff5555, #880000)",
  },
  bpCenter: {
    width: 16, height: 16, borderRadius: "50%",
    background: "radial-gradient(circle at 35% 35%, #ff5555, #880000)",
    gridColumn: 2, gridRow: 2,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 8 },
  brandZike: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 28, letterSpacing: 6, color: "#fff",
    textShadow: "0 0 20px rgba(255,255,255,0.3)",
  },
  menuTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "clamp(36px,10vw,56px)",
    letterSpacing: 8, color: "#f0e8d0", margin: 0,
    textShadow: "0 2px 12px rgba(0,0,0,0.8)",
  },
  menuSub: { fontSize: 11, color: "#888", fontStyle: "italic", margin: 0, letterSpacing: 1 },
  btnGroup: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" },
  primaryBtn: {
    background: "linear-gradient(135deg,#c07030 0%,#7a3810 100%)",
    border: "2px solid #d08848",
    color: "#fff8ee", padding: "8px 24px",
    borderRadius: 4, cursor: "pointer",
    fontFamily: "'Rajdhani',sans-serif",
    fontSize: 15, fontWeight: 700, letterSpacing: 2,
    width: "100%", maxWidth: 280, transition: "filter 0.15s",
  },
  secBtn: {
    background: "transparent",
    border: "2px solid #3a3a2a",
    color: "#b8a878", padding: "8px 24px",
    borderRadius: 4, cursor: "pointer",
    fontFamily: "'Rajdhani',sans-serif",
    fontSize: 15, fontWeight: 700, letterSpacing: 2,
    width: "100%", maxWidth: 280, transition: "filter 0.15s",
  },
  rulesBox: {
    background: "rgba(0,0,0,0.5)", border: "1px solid #2a2a1a",
    borderRadius: 6, padding: "10px 14px", width: "100%",
  },
  rulesTitle: { fontSize: 9, letterSpacing: 3, color: "#c07030", marginBottom: 6 },
  ruleItem: { fontSize: 11, color: "#9a8868", lineHeight: "1.8", display: "flex", gap: 6 },
  ruleDot: { color: "#c07030", flexShrink: 0 },

  trophy: { fontSize: 56 },
  goTitle: {
    fontFamily: "'Bebas Neue',sans-serif",
    fontSize: "clamp(32px,9vw,48px)", letterSpacing: 4,
    color: "#f0e8d0", textAlign: "center",
  },
  goSub: { fontSize: 14, color: "#888" },
  finalScore: {
    display: "flex", alignItems: "center", gap: 28,
    background: "rgba(0,0,0,0.5)", border: "1px solid #2a2a1a",
    borderRadius: 8, padding: "16px 32px", marginBottom: 8,
  },
  fsBox: { textAlign: "center" },
  fsLabel: { fontSize: 9, letterSpacing: 2, color: "#665544" },
  fsNum: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: "#f0e8d0", lineHeight: 1 },
  fsHint: { fontSize: 9, color: "#554433" },
  fsDivider: { width: 1, height: 50, background: "#2a2a1a" },

  gameWrap: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 2,
    width: "100%", maxWidth: "min(99vh,99vw)",
    height: "auto",
    padding: "2px",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "2px 4px", flexShrink: 0,
  }, 
  headerTitle: {
    fontFamily: "'Bebas Neue',sans-serif",
    fontSize: 16, letterSpacing: 5, color: "#f0e8d0",
  },
  modeTag: { fontSize: 11, color: "#666" },
  menuBtn: {
    background: "transparent", border: "1px solid #333",
    color: "#888", padding: "5px 10px", borderRadius: 3,
    cursor: "pointer", fontFamily: "'Rajdhani',sans-serif",
    fontSize: 11, letterSpacing: 1,
  },
  scorebar: {
    display: "flex", alignItems: "center", gap: 6, width: "100%",
    background: "rgba(0,0,0,0.6)", border: "1px solid #222",
    borderRadius: 4, padding: "3px 8px", flexShrink: 0,
  },
  scoreBox: {
    textAlign: "center", minWidth: 58, padding: "4px 6px",
    borderRadius: 4, border: "2px solid transparent", transition: "border-color 0.3s",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
  },
  scoreActive: { borderColor: "#c07030" },
  scoreCircle: {
    width: 14, height: 14, borderRadius: "50%",
    background: "radial-gradient(circle at 35% 35%, #f5e8c8, #b89050)",
    border: "1px solid #8a6028",
  },
  scoreLabel: { fontSize: 8, letterSpacing: 1.5, color: "#665544" },
  scoreNum: {
    fontFamily: "'Bebas Neue',sans-serif",
    fontSize: 18, color: "#f0e8d0", lineHeight: 1,
  },
  centerInfo: { flex: 1, textAlign: "center" },
  turnText: { fontSize: 10, color: "#d4b878", fontWeight: 700, letterSpacing: 1, marginBottom: 2 },
  powerTrack: {
    height: 4, background: "rgba(0,0,0,0.5)",
    borderRadius: 3, border: "1px solid #222", overflow: "hidden",
  },
  powerFill: { height: "100%", borderRadius: 3, transition: "width 0.04s, background 0.08s" },
  powerLabel: { fontSize: 9, color: "#443322", letterSpacing: 1, marginTop: 3 },
  canvasWrap: {
    borderRadius: 4, overflow: "hidden",
    boxShadow: "0 8px 48px rgba(0,0,0,0.9)",
    flex: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "100%", height: "auto", aspectRatio: "1/1",
  },
  canvas: {
    display: "block", width: "auto", height: "100%",
    maxWidth: "100%", maxHeight: "100%",
    aspectRatio: "1/1", touchAction: "none", cursor: "crosshair",
  },
  statusBar: {
    fontSize: "clamp(9px,1.2vw,11px)", color: "#c8a840",
    fontWeight: 700, letterSpacing: 0.5,
    textAlign: "center", minHeight: 16, padding: "1px 8px",
    background: "rgba(0,0,0,0.4)", borderRadius: 4,
    width: "100%", flexShrink: 0,
  },
  hint: {
    fontSize: "clamp(7px,0.8vw,9px)", color: "#333",
    letterSpacing: 1, textAlign: "center", flexShrink: 0, paddingBottom: 2,
  },
};