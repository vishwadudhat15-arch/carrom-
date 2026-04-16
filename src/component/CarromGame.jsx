import { useState, useRef, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BASE = 560;
const FRAME = BASE * 0.1;
const INNER = BASE - FRAME * 2;
const CX = BASE / 2;
const CY = BASE / 2;
const PR = BASE * 0.026;
const SR = BASE * 0.033;
const POCKET_R = BASE * 0.048;
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

// ─── UTILS ────────────────────────────────────────────────────────────────────
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

const inPocket = (p) =>
  POCKETS.some((pk) => Math.hypot(p.x - pk.x, p.y - pk.y) < POCKET_R - 4);

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
  const gap = 1.02; // Small spacing to prevent explosive physics

  arr.push({
    id: "queen", x: CX, y: CY, vx: 0, vy: 0,
    type: "queen", pocketed: false, sinking: false, sinkScale: 1,
  });

  // Inner ring (6 pieces)
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const rd = 2 * PR * gap;
    arr.push({
      id: "inner" + i,
      x: CX + Math.cos(a) * rd,
      y: CY + Math.sin(a) * rd,
      vx: 0, vy: 0, type: i % 2 === 0 ? "white" : "black",
      pocketed: false, sinking: false, sinkScale: 1,
    });
  }

  // Outer ring (12 pieces)
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const rd = (i % 2 === 0 ? 4 * PR : 2 * Math.sqrt(3) * PR) * gap;
    arr.push({
      id: "outer" + i,
      x: CX + Math.cos(a) * rd,
      y: CY + Math.sin(a) * rd,
      vx: 0, vy: 0, type: i % 2 === 0 ? "black" : "white",
      pocketed: false, sinking: false, sinkScale: 1,
    });
  }
  return arr;
}

// ─── PHYSICS ──────────────────────────────────────────────────────────────────
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

// ─── CANVAS DRAWING ───────────────────────────────────────────────────────────
function drawBoardBackground(ctx) {
  ctx.fillStyle = "#2a1a08";
  ctx.fillRect(0, 0, BASE, BASE);

  // Frame panels
  const panels = [
    [0, 0, BASE, FRAME, "h"],
    [0, BASE - FRAME, BASE, FRAME, "h"],
    [0, FRAME, FRAME, INNER, "v"],
    [BASE - FRAME, FRAME, FRAME, INNER, "v"],
  ];
  panels.forEach(([x, y, w, h, dir]) => {
    ctx.fillStyle = "#c07828";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    if (dir === "h") {
      for (let i = 0; i < w; i += 9) ctx.fillRect(x + i, y, 4, h);
    } else {
      for (let i = 0; i < h; i += 9) ctx.fillRect(x, y + i, w, 4);
    }
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    if (dir === "h") {
      for (let i = 2; i < w; i += 9) ctx.fillRect(x + i, y, 2, h);
    } else {
      for (let i = 2; i < h; i += 9) ctx.fillRect(x, y + i, w, 2);
    }
  });

  // Inner board surface
  const bg = ctx.createLinearGradient(FRAME, FRAME, FRAME + INNER, FRAME + INNER);
  bg.addColorStop(0, "#e8c880");
  bg.addColorStop(0.4, "#d8b868");
  bg.addColorStop(1, "#c09848");
  ctx.fillStyle = bg;
  ctx.fillRect(FRAME, FRAME, INNER, INNER);

  // Board border lines
  ctx.strokeStyle = "rgba(80,40,0,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(FRAME, FRAME, INNER, INNER);
  const m1 = FRAME + BASE * 0.042;
  ctx.strokeStyle = "rgba(80,40,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m1, m1, BASE - m1 * 2, BASE - m1 * 2);
  const m2 = FRAME + BASE * 0.075;
  ctx.strokeStyle = "rgba(80,40,0,0.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(m2, m2, BASE - m2 * 2, BASE - m2 * 2);

  // Center circles
  ctx.beginPath();
  ctx.arc(CX, CY, BASE * 0.162, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(80,40,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, CY, BASE * 0.065, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(80,40,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cross lines
  ctx.strokeStyle = "rgba(160,50,20,0.45)";
  ctx.lineWidth = 1;
  const cl = BASE * 0.065;
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(CX + dx * cl, CY + dy * cl);
    ctx.lineTo(CX + dx * BASE * 0.155, CY + dy * BASE * 0.155);
    ctx.stroke();
  });

  // Corner arrows
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sy]) => {
    const bx = FRAME + BASE * 0.058, by = FRAME + BASE * 0.058;
    const ex = FRAME + BASE * 0.115, ey = FRAME + BASE * 0.115;
    ctx.strokeStyle = "rgba(120,60,10,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CX + sx * bx - CX + (sx > 0 ? FRAME + BASE * 0.058 : BASE - FRAME - BASE * 0.058),
      CY + sy * by - CY + (sy > 0 ? FRAME + BASE * 0.058 : BASE - FRAME - BASE * 0.058));
  });
}

function drawBaseline(ctx, turn) {
  const baseY = turn === 0 ? BASE - FRAME - SR * 2.8 : FRAME + SR * 2.8;
  const bx = FRAME + BASE * 0.04;
  ctx.strokeStyle = "rgba(80,40,0,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx, baseY);
  ctx.lineTo(BASE - bx, baseY);
  ctx.stroke();
  [bx, BASE - bx].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, baseY, BASE * 0.016, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawPockets(ctx) {
  POCKETS.forEach((pk) => {
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, POCKET_R + 6, 0, Math.PI * 2);
    ctx.fillStyle = "#5a3010";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, POCKET_R + 3, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0804";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, POCKET_R, 0, Math.PI * 2);
    ctx.fillStyle = "#080200";
    ctx.fill();
    // Pocket highlight
    const grad = ctx.createRadialGradient(pk.x - POCKET_R * 0.3, pk.y - POCKET_R * 0.3, 1, pk.x, pk.y, POCKET_R);
    grad.addColorStop(0, "rgba(100,50,10,0.2)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, POCKET_R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  });
}

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
  ctx.arc(2, 2, PR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fill();

  let outerColor, innerColor, dotColor;
  if (p.type === "queen") {
    outerColor = "#cc3388"; innerColor = "#ee66aa"; dotColor = "#ffaacc";
  } else if (p.type === "white") {
    outerColor = "#c8c8c8"; innerColor = "#f5f5f5"; dotColor = "#ffffff";
  } else {
    outerColor = "#1e1e1e"; innerColor = "#383838"; dotColor = "#555555";
  }

  ctx.beginPath();
  ctx.arc(0, 0, PR, 0, Math.PI * 2);
  ctx.fillStyle = outerColor;
  ctx.fill();
  ctx.strokeStyle = p.type === "white" ? "#888" : "#000";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, PR * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = innerColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, PR * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(-PR * 0.3, -PR * 0.35, PR * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.38)";
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

  ctx.beginPath();
  ctx.arc(2, 2, SR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, SR, 0, Math.PI * 2);
  ctx.fillStyle = "#ddaa00";
  ctx.fill();
  ctx.strokeStyle = "#886600";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, SR * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffcc44";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, SR * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "#ffee88";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(-SR * 0.3, -SR * 0.35, SR * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();

  ctx.restore();
}

function drawAimGuide(ctx, striker, aimAngle, power) {
  ctx.save();

  const cos = Math.cos(aimAngle);
  const sin = Math.sin(aimAngle);
  const powerFrac = power / 100;

  // ── 1. Trajectory dotted line ─────────────────────────────────────────────
  // Fade dots out as they get further away from the striker
  const numDots = 14;
  const dotSpacing = BASE * 0.045;
  for (let i = 1; i <= numDots; i++) {
    const fade = 1 - i / (numDots + 1);
    const alpha = fade * 0.9 * (0.5 + powerFrac * 0.5);
    const dotR = 3 * fade;
    const dx = striker.x + cos * dotSpacing * i;
    const dy = striker.y + sin * dotSpacing * i;
    ctx.beginPath();
    ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }

  // ── 2. Arrowhead at the end of the visible trajectory ─────────────────────
  const arrowDist = dotSpacing * numDots;
  const ax = striker.x + cos * arrowDist;
  const ay = striker.y + sin * arrowDist;
  const headLen = 10;
  const spread = Math.PI / 6;
  const alpha = 0.7 + powerFrac * 0.3;
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ax - cos * headLen * 1.5, ay - sin * headLen * 1.5);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(
    ax - headLen * Math.cos(aimAngle - spread),
    ay - headLen * Math.sin(aimAngle - spread)
  );
  ctx.moveTo(ax, ay);
  ctx.lineTo(
    ax - headLen * Math.cos(aimAngle + spread),
    ay - headLen * Math.sin(aimAngle + spread)
  );
  ctx.stroke();

  // ── 3. Pull-back power bar (behind striker) ───────────────────────────────
  if (power > 3) {
    const pd = powerFrac * BASE * 0.28;
    // Glow outer
    ctx.lineCap = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = `rgba(255,100,0,${0.12 + powerFrac * 0.18})`;
    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(striker.x - cos * pd, striker.y - sin * pd);
    ctx.stroke();
    // Core bar
    const r = Math.min(255, Math.round(255 * powerFrac));
    const g = Math.max(0, Math.round(220 - 200 * powerFrac));
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(${r},${g},0,${0.6 + powerFrac * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(striker.x, striker.y);
    ctx.lineTo(striker.x - cos * pd, striker.y - sin * pd);
    ctx.stroke();
    // Bright tip dot
    ctx.beginPath();
    ctx.arc(striker.x - cos * pd, striker.y - sin * pd, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,220,80,${0.7 + powerFrac * 0.3})`;
    ctx.fill();
  }

  // ── 4. Striker ring ───────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(striker.x, striker.y, SR + 7, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,210,60,${0.25 + powerFrac * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function CarromGame() {
  const canvasRef = useRef(null);
  const gsRef = useRef(null); // single mutable game state object
  const rafRef = useRef(null);
  const aiTimerRef = useRef(null);
  const resolveTimerRef = useRef(null);
  const bgCanvasRef = useRef(null);

  const [screen, setScreen] = useState("menu"); // "menu" | "game" | "gameover"
  const [uiTurn, setUiTurn] = useState(0);
  const [uiScores, setUiScores] = useState({ w: 9, b: 9 });
  const [uiPower, setUiPower] = useState(0);
  const [uiStatus, setUiStatus] = useState("");
  const [uiWinner, setUiWinner] = useState("");
  const [gameMode, setGameMode] = useState("pvp");

  const getBaseY = (t) => (t === 0 ? BASE - FRAME - SR * 2.8 : FRAME + SR * 2.8);

  const resetStriker = useCallback((gs, t, offX = 0) => {
    gs.striker = {
      x: CX + offX, y: getBaseY(t),
      vx: 0, vy: 0,
      pocketed: false, sinking: false, sinkScale: 1,
      isStriker: true,
    };
  }, []);

  const returnQueen = useCallback((gs) => {
    const q = gs.pieces.find((p) => p.type === "queen");
    if (q) {
      q.x = CX; q.y = CY; q.vx = 0; q.vy = 0;
      q.pocketed = false; q.sinking = false; q.sinkScale = 1;
    }
    gs.queenOut = true;
    gs.queenPendingCoverBy = -1;
  }, []);

  const endGame = useCallback((winner) => {
    const gs = gsRef.current;
    if (!gs) return;
    gs.phase = "gameover";
    setUiWinner(winner === 0 ? "White" : "Black");
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
    const nx = clamp(t.x + jitter, BOUNDS.L + SR + 10, BOUNDS.R - SR - 10);
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

    const wr = gs.pieces.filter((p) => !p.pocketed && p.type === "white").length;
    const br = gs.pieces.filter((p) => !p.pocketed && p.type === "black").length;
    const wJustPocketed = gs.wPrev - wr;
    const bJustPocketed = gs.bPrev - br;
    const queenPiece = gs.pieces.find((p) => p.type === "queen");
    const queenJustPocketed = gs.queenOut && queenPiece && queenPiece.pocketed;

    gs.wPrev = wr;
    gs.bPrev = br;
    setUiScores({ w: wr, b: br });

    if (wr === 0) { endGame(0); return; }
    if (br === 0) { endGame(1); return; }

    let switchTurn = false, msg = "";
    let foul = false;

    if (gs.striker.pocketed) {
      foul = true;
      switchTurn = true;
      msg = "⚡ Foul! Striker pocketed — turn switches.";
    }

    const myPocketed = gs.turn === 0 ? wJustPocketed : bJustPocketed;
    const oppPocketed = gs.turn === 0 ? bJustPocketed : wJustPocketed;

    if (oppPocketed > 0) {
      switchTurn = true;
      msg += (msg ? " " : "") + "⚠️ Opponent coin pocketed — turn switches.";
    }

    if (gs.queenPendingCoverBy === gs.turn) {
      // This was the cover shot!
      if (myPocketed > 0 && !foul) {
        gs.queenPendingCoverBy = -1;
        msg = "♛ Queen COVERED!" + (msg ? " " + msg : "");
        switchTurn = oppPocketed > 0;
      } else {
        gs.queenPendingCoverBy = -1;
        returnQueen(gs);
        msg = "❌ Queen cover failed! Queen returned." + (msg ? " " + msg : "");
        switchTurn = true;
      }
    } else if (queenJustPocketed) {
      if (foul) {
        returnQueen(gs);
        msg += " ❌ Foul! Queen returned.";
      } else if (myPocketed > 0 && oppPocketed === 0) {
        gs.queenOut = false;
        gs.queenPendingCoverBy = -1;
        switchTurn = false;
        msg = "♛ Queen pocketed and instantly COVERED!" + (msg ? " " + msg : "");
      } else if (oppPocketed > 0) {
        returnQueen(gs);
        msg = "⚠️ Opponent coin pocketed — Queen returned." + (msg ? " " + msg : "");
        switchTurn = true;
      } else {
        gs.queenOut = false;
        gs.queenPendingCoverBy = gs.turn;
        switchTurn = false;
        msg = "♛ Queen pocketed! Cover it next shot." + (msg ? " " + msg : "");
      }
    } else {
      if (!switchTurn) {
        if (myPocketed > 0) {
          msg = "✅ Great shot! Go again." + (msg ? " " + msg : "");
          switchTurn = false;
        } else if (myPocketed === 0 && oppPocketed === 0 && !foul) {
          switchTurn = true;
          msg = "No coins pocketed — turn switches.";
        }
      }
    }

    setUiStatus(msg.trim());

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
      setUiStatus(nextTurn === 0 ? "White's turn — drag to aim" : "Black's turn — drag to aim");
      if (gameMode === "pvc" && nextTurn === 1) {
        aiTimerRef.current = setTimeout(doAI, 900);
      }
    }, 750);
  }, [endGame, returnQueen, resetStriker, doAI, gameMode]);

  // ─── GAME LOOP ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const loop = () => {
      const gs = gsRef.current;
      if (!gs) return;
      const ctx = canvas.getContext("2d");

      // Physics
      if (gs.phase === "rolling") {
        const fr = Math.pow(FRICTION, 1 / 8);
        const all = [gs.striker, ...gs.pieces];
        const active = all.filter((p) => !p.pocketed);

        for (let s = 0; s < 8; s++) {
          active.forEach((p) => {
            p.x += p.vx / 8;
            p.y += p.vy / 8;
            p.vx *= fr;
            p.vy *= fr;
            // Handle pocket gravity and simplified wall bounce
            let insidePocket = false;
            let pocketGravity = false;
            let pullX = 0, pullY = 0;

            POCKETS.forEach((pk) => {
              const d = Math.hypot(p.x - pk.x, p.y - pk.y);
              // If the coin's center crosses the rim (d < POCKET_R), >50% is over the hole.
              // It will fall in. Otherwise, it stands by perfectly on the edge!
              if (d < POCKET_R) {
                pocketGravity = true;
                pullX = (pk.x - p.x) * 0.08;
                pullY = (pk.y - p.y) * 0.08;
              }

              // It is fully collected once it visually sinks inward
              if (d < POCKET_R * 0.5) {
                insidePocket = true;
              }
            });

            if (pocketGravity) {
              p.x += pullX;
              p.y += pullY;
            } else {
              if (p.isStriker) strikerWallBounce(p);
              else wallBounce(p);
            }

            if (!p.pocketed && insidePocket) {
              p.pocketed = true;
              p.sinking = true;
              p.sinkScale = 1.0;
            }
          });
          // Collisions
          for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
              circleCollide(active[i], active[j]);
            }
          }
        }

        // Sink animation
        all.forEach((p) => {
          if (p.sinking && p.sinkScale > 0.04) {
            const pk = nearestPocket(p);
            if (pk) {
              p.x += (pk.x - p.x) * 0.18;
              p.y += (pk.y - p.y) * 0.18;
            }
            p.sinkScale *= 0.82;
            if (p.sinkScale < 0.04) p.sinkScale = 0;
          }
        });

        // Check if everything stopped
        const moving = active.filter((p) => Math.hypot(p.vx, p.vy) > MIN_V);
        const sinking = all.filter((p) => p.sinking && p.sinkScale > 0.04);
        if (moving.length === 0 && sinking.length === 0 && !gs.resolving) {
          gs.resolving = true;
          resolveTimerRef.current = setTimeout(resolveTurn, 500);
        }
      }

      // Render
      if (!bgCanvasRef.current) {
        const bc = document.createElement("canvas");
        bc.width = BASE;
        bc.height = BASE;
        const bctx = bc.getContext("2d", { alpha: false });
        drawBoardBackground(bctx);
        drawPockets(bctx);
        bgCanvasRef.current = bc;
      }
      ctx.drawImage(bgCanvasRef.current, 0, 0);
      drawBaseline(ctx, gs.turn);

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

  // ─── INPUT ──────────────────────────────────────────────────────────────────
  const getXY = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scl = BASE / rect.width;
    const cl = e.touches ? e.touches[0] : e;
    return { x: (cl.clientX - rect.left) * scl, y: (cl.clientY - rect.top) * scl };
  }, []);

  const handlePointerDown = useCallback((e) => {
    const gs = gsRef.current;
    if (!gs || gs.phase !== "aim") return;
    if (gameMode === "pvc" && gs.turn === 1) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    const { x, y } = getXY(e);
    const ds = Math.hypot(x - gs.striker.x, y - gs.striker.y);
    if (ds < SR * 4.5) {
      gs.dragMode = "aim";
    } else {
      gs.dragMode = "pos";
      const nx = clamp(x, BOUNDS.L + SR + 10, BOUNDS.R - SR - 10);
      gs.strikerOffsetX = nx - CX;
      gs.striker.x = nx;
    }
  }, [gameMode, getXY]);

  const handlePointerMove = useCallback((e) => {
    const gs = gsRef.current;
    if (!gs || !gs.dragMode || gs.phase !== "aim") return;
    const { x, y } = getXY(e);
    if (gs.dragMode === "pos") {
      const nx = clamp(x, BOUNDS.L + SR + 10, BOUNDS.R - SR - 10);
      gs.strikerOffsetX = nx - CX;
      gs.striker.x = nx;
    } else {
      // Pull-back: angle points FROM drag point TO striker
      const dx = gs.striker.x - x;
      const dy = gs.striker.y - y;
      gs.aimAngle = Math.atan2(dy, dx);
      gs.power = clamp(Math.hypot(dx, dy) * 0.72, 0, 100);
      setUiPower(gs.power);
    }
  }, [getXY]);

  const handlePointerUp = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    if (gs.dragMode === "aim" && gs.power > 10 && gs.phase === "aim") shoot();
    gs.dragMode = null;
    gs.power = 0;
    setUiPower(0);
  }, [shoot]);

  // ─── START / MENU ────────────────────────────────────────────────────────────
  const startGame = useCallback((mode) => {
    clearTimeout(aiTimerRef.current);
    clearTimeout(resolveTimerRef.current);
    cancelAnimationFrame(rafRef.current);

    const pieces = createPieces();
    gsRef.current = {
      pieces,
      striker: {},
      phase: "aim",
      turn: 0,
      aimAngle: -Math.PI / 2,
      power: 0,
      strikerOffsetX: 0,
      dragMode: null,
      resolving: false,
      queenOut: true,
      queenPendingCoverBy: -1,
      wPrev: 9,
      bPrev: 9,
    };
    resetStriker(gsRef.current, 0, 0);

    setGameMode(mode);
    setUiTurn(0);
    setUiScores({ w: 9, b: 9 });
    setUiPower(0);
    setUiStatus("White's turn — drag to aim");
    setUiWinner("");
    setScreen("game");
  }, [resetStriker]);

  const goMenu = useCallback(() => {
    clearTimeout(aiTimerRef.current);
    clearTimeout(resolveTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    setScreen("menu");
  }, []);

  // ─── COMPUTED ────────────────────────────────────────────────────────────────
  const powerPct = Math.round(uiPower);
  const powerColor = powerPct < 40 ? "#44cc44" : powerPct < 55 ? "#ffcc00" : "#ff4400";
  const isAITurn = gameMode === "pvc" && uiTurn === 1;

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  // MENU SCREEN
  if (screen === "menu") {
    return (
      <div style={s.root}>
        <style>{globalCss}</style>
        <div style={s.menuWrap}>
          <div style={s.menuGlow} />
          <div style={s.logoRing}>
            <div style={s.logoQueen} />
          </div>
          <h1 style={s.menuTitle}>CARROM</h1>
          <p style={s.menuSub}>Classic Board Game</p>
          <div style={s.btnGroup}>
            <button
              style={s.primaryBtn}
              onClick={() => startGame("pvp")}
              onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
            >
              👥 Two Players
            </button>
            <button
              style={s.secBtn}
              onClick={() => startGame("pvc")}
              onMouseOver={(e) => (e.currentTarget.style.background = "rgba(90,58,16,0.3)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              🤖 vs Computer
            </button>
          </div>
          <div style={s.rulesBox}>
            <div style={s.rulesTitle}>HOW TO PLAY</div>
            {[
              "Drag away from the striker to aim — release to shoot",
              "White pockets white coins, Black pockets black coins",
              "Pocket the Queen (pink), then cover it next shot",
              "Striker pocketed = Foul, opponent's turn",
              "Clear all your coins first to win the game",
            ].map((rule, i) => (
              <div key={i} style={s.ruleItem}>
                <span style={s.ruleDot}>▪</span> {rule}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // GAME OVER SCREEN
  if (screen === "gameover") {
    return (
      <div style={s.root}>
        <style>{globalCss}</style>
        <div style={s.menuWrap}>
          <div style={s.menuGlow} />
          <div style={s.trophy}>🏆</div>
          <div style={s.goTitle}>{uiWinner} Wins!</div>
          <div style={s.goSub}>Congratulations!</div>
          <div style={s.finalScore}>
            <div style={s.fsBox}>
              <div style={s.fsLabel}>WHITE</div>
              <div style={s.fsNum}>{uiScores.w}</div>
              <div style={s.fsHint}>remaining</div>
            </div>
            <div style={s.fsDivider} />
            <div style={s.fsBox}>
              <div style={s.fsLabel}>BLACK</div>
              <div style={s.fsNum}>{uiScores.b}</div>
              <div style={s.fsHint}>remaining</div>
            </div>
          </div>
          <button
            style={{ ...s.primaryBtn, width: 240 }}
            onClick={() => startGame(gameMode)}
          >
            Play Again
          </button>
          <button
            style={{ ...s.secBtn, width: 240, marginTop: 8 }}
            onClick={goMenu}
          >
            Main Menu
          </button>
        </div>
      </div>
    );
  }

  // GAME SCREEN
  return (
    <div style={s.root}>
      <style>{globalCss}</style>
      <div style={s.gameWrap}>
        {/* Header */}
        <div style={s.header}>
          <button style={s.menuBtn} onClick={goMenu}>
            ← MENU
          </button>
          <span style={s.headerTitle}>CARROM</span>
          <span style={s.modeTag}>
            {gameMode === "pvc" ? "🤖 vs AI" : "👥 2P"}
          </span>
        </div>

        {/* Score Bar */}
        <div style={s.scorebar}>
          <div style={{ ...s.scoreBox, ...(uiTurn === 0 ? s.scoreActive : {}) }}>
            <div style={s.scoreLabel}>WHITE</div>
            <div style={s.scoreNum}>{uiScores.w}</div>
          </div>

          <div style={s.centerInfo}>
            <div style={s.turnText}>
              {isAITurn
                ? "🤖 AI is thinking..."
                : gameMode === "pvc"
                  ? "Your Turn"
                  : uiTurn === 0
                    ? "White's Turn"
                    : "Black's Turn"}
            </div>
            <div style={s.powerTrack}>
              <div
                style={{
                  ...s.powerFill,
                  width: `${powerPct}%`,
                  background: powerColor,
                }}
              />
            </div>
            <div style={s.powerLabel}>
              {powerPct > 0 ? `Power: ${powerPct}%` : "Power"}
            </div>
          </div>

          <div style={{ ...s.scoreBox, ...(uiTurn === 1 ? s.scoreActive : {}) }}>
            <div style={s.scoreLabel}>BLACK</div>
            <div style={s.scoreNum}>{uiScores.b}</div>
          </div>
        </div>

        {/* Canvas */}
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

        {/* Status */}
        <div style={s.statusBar}>{uiStatus || "\u00A0"}</div>
        <div style={s.hint}>
          Drag away from striker to aim &bull; Release to shoot
        </div>
      </div>
    </div>
  );
}
// fix github repos
// ─── STYLES ───────────────────────────────────────────────────────────────────
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;900&display=swap');
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: fixed;
    touch-action: none;
    
  }
  #root { height: 100%; }
`;

const s = {
  root: {
    width: "100vw",
    height: "100dvh",
    background: "linear-gradient(145deg,#1c0e04 0%,#0d0702 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Cinzel', Georgia, serif",
    color: "#f5e8cc",
    padding: "clamp(4px, 1.5vw, 12px)",
    overflow: "hidden",
    position: "relative",
  },

  // ── Menu / Gameover ──
  menuWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    maxWidth: 320,
    width: "100%",
    position: "relative",
  },
  menuGlow: {
    position: "absolute",
    top: "50%", left: "50%",
    transform: "translate(-50%,-50%)",
    width: 280, height: 280,
    borderRadius: "50%",
    background: "radial-gradient(circle,rgba(200,140,40,0.1) 0%,transparent 70%)",
    pointerEvents: "none",
  },
  logoRing: {
    width: 60, height: 60,
    borderRadius: "50%",
    border: "2px solid #8b6030",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 16px rgba(200,140,40,0.2)",
  },
  logoQueen: {
    width: 32, height: 32,
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 35%,#ee66aa,#cc3388)",
    boxShadow: "0 0 10px rgba(200,60,140,0.4)",
  },
  menuTitle: {
    fontSize: "clamp(28px,8vw,44px)",
    fontWeight: 900,
    letterSpacing: 6,
    color: "#ffcc44",
    margin: 0,
    textShadow: "0 2px 8px rgba(0,0,0,0.6)",
  },
  menuSub: {
    fontSize: 11, color: "#998877", fontStyle: "italic", margin: 0,
  },
  btnGroup: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%",
  },
  primaryBtn: {
    background: "linear-gradient(135deg,#c88030,#8b5020)",
    border: "1px solid #ddaa44",
    color: "#ffeecc",
    padding: "10px 24px",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "'Cinzel',serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 1.5,
    minWidth: 200,
    maxWidth: 240,
    width: "100%",
    transition: "opacity 0.15s",
  },
  secBtn: {
    background: "transparent",
    border: "1px solid #5a3a10",
    color: "#ccaa66",
    padding: "10px 24px",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "'Cinzel',serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 1.5,
    minWidth: 200,
    maxWidth: 240,
    width: "100%",
    transition: "background 0.15s",
  },
  rulesBox: {
    background: "rgba(0,0,0,0.38)",
    border: "1px solid #3a2010",
    borderRadius: 8,
    padding: "10px 14px",
    width: "100%",
  },
  rulesTitle: {
    fontSize: 9, letterSpacing: 2, color: "#cc9933", marginBottom: 6,
  },
  ruleItem: {
    fontSize: 10, color: "#aa9977", lineHeight: "1.7", display: "flex", gap: 5,
  },
  ruleDot: { color: "#cc9933", flexShrink: 0 },

  // ── Gameover ──
  trophy: { fontSize: 52 },
  goTitle: {
    fontSize: "clamp(28px,8vw,42px)",
    fontWeight: 900,
    color: "#ffcc44",
    textAlign: "center",
    textShadow: "0 2px 8px rgba(0,0,0,0.5)",
  },
  goSub: { fontSize: 16, color: "#aa9977" },
  finalScore: {
    display: "flex",
    alignItems: "center",
    gap: 24,
    background: "rgba(0,0,0,0.35)",
    border: "1px solid #3a2010",
    borderRadius: 10,
    padding: "16px 32px",
    marginBottom: 8,
  },
  fsBox: { textAlign: "center" },
  fsLabel: { fontSize: 10, letterSpacing: 2, color: "#887755" },
  fsNum: { fontSize: 36, fontWeight: 900, color: "#ffcc44" },
  fsHint: { fontSize: 10, color: "#665544" },
  fsDivider: { width: 1, height: 50, background: "#3a2010" },

  // ── Game ──
  gameWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "clamp(4px,0.8vh,12px)",
    width: "100%",
    maxWidth: "min(96vh, 98vw)",
    height: "100dvh",
    minHeight: 0,
    padding: "0 clamp(4px, 1vw, 16px)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "4px 4px",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 18, fontWeight: 900, letterSpacing: 5, color: "#ffcc44",
  },
  modeTag: { fontSize: 11, color: "#887755" },
  menuBtn: {
    background: "transparent",
    border: "1px solid #5a3010",
    color: "#cc9933",
    padding: "5px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "'Cinzel',serif",
    fontSize: 11,
    letterSpacing: 1,
  },
  scorebar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "rgba(0,0,0,0.45)",
    border: "1px solid #3a2010",
    borderRadius: 8,
    padding: "5px 10px",
    flexShrink: 0,
  },
  scoreBox: {
    textAlign: "center",
    minWidth: 54,
    padding: "4px 6px",
    borderRadius: 6,
    border: "2px solid transparent",
    transition: "border-color 0.3s",
  },
  scoreActive: { borderColor: "#ffcc44" },
  scoreLabel: { fontSize: 8, letterSpacing: 1.5, color: "#887755" },
  scoreNum: { fontSize: 20, fontWeight: 900, color: "#ffcc44" },
  centerInfo: { flex: 1, textAlign: "center" },
  turnText: {
    fontSize: 12, color: "#ffdd88", fontStyle: "italic", marginBottom: 4,
  },
  powerTrack: {
    height: 5,
    background: "rgba(0,0,0,0.4)",
    borderRadius: 3,
    border: "1px solid #3a2010",
    overflow: "hidden",
  },
  powerFill: { height: "100%", borderRadius: 3, transition: "width 0.04s, background 0.08s" },
  powerLabel: {
    fontSize: 9, color: "#554433", letterSpacing: 1, marginTop: 3,
  },
  canvasWrap: {
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 12px 64px rgba(0,0,0,0.85)",
    flex: "1 1 0",
    minHeight: 0,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: "100%",
  },
  canvas: {
    display: "block",
    width: "auto",
    height: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    aspectRatio: "1 / 1",
    touchAction: "none",
    cursor: "crosshair",
  },
  statusBar: {
    fontSize: "clamp(10px,1.4vw,13px)",
    color: "#ffdd44",
    fontStyle: "italic",
    textAlign: "center",
    minHeight: 20,
    padding: "3px 12px",
    background: "rgba(0,0,0,0.3)",
    borderRadius: 6,
    width: "100%",
    flexShrink: 0,
  },
  hint: {
    fontSize: "clamp(8px,1vw,10px)",
    color: "#443322",
    letterSpacing: 1,
    textAlign: "center",
    flexShrink: 0,
    paddingBottom: 4,
  },
};