const { useState, useEffect, useRef } = React;

/* ============================== 상수 ============================== */
const COLS = 10, ROWS = 20, HIDDEN = 2, TOTAL = ROWS + HIDDEN;
const CELL = 32, W = COLS * CELL, H = ROWS * CELL;
const DAS = 160, ARR = 38, LOCK_DELAY = 500, MAX_RESETS = 15;
const CLEAR_DUR = 300, DROP_START = 800;
const HI_KEY = 'tetris-react-ts-hi';

const TYPES = ['I','J','L','O','S','T','Z'];
const COLORS: Record<string,string> = {
  I:'#53D1C9', J:'#5D7FE0', L:'#DE9A4A', O:'#D9C15C',
  S:'#6FBF63', T:'#A883D8', Z:'#D9646C',
};

const BASE: Record<string,number[][]> = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
  O: [[1,1],[1,1]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
};
const rotCW = (m:number[][]):number[][] => m[0].map((_, i) => m.map(r => r[i]).reverse());
const SHAPES: number[][][][] = TYPES.map(t => {
  let m = BASE[t]; const arr = [m];
  for (let r = 0; r < 3; r++) { m = rotCW(m); arr.push(m); }
  return arr;
});

/* SRS 킥 테이블 (y축은 위가 +, 적용 시 부호 반전) */
const K_JLSTZ: Record<string,[number,number][]> = {
  '01':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '10':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '12':[[0,0],[1,0],[1,-1],[0,2],[1,2]],     '21':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '23':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],    '32':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '30':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  '03':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const K_I: Record<string,[number,number][]> = {
  '01':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],  '10':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '12':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],  '21':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '23':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],  '32':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '30':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],  '03':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

/* ============================== 사운드 ============================== */
let actx: AudioContext | null = null;
let muted = false;
function ensureAudio() {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!actx) actx = new AC();
  if (actx.state === 'suspended') actx.resume();
}
function tone(f:number, dur:number, type:OscillatorType='square', vol=0.12, delay=0, slide=0) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
const sfx = {
  move:   () => tone(200, .03, 'square', .05),
  rotate: () => tone(340, .05, 'square', .06, 0, 150),
  hold:   () => tone(480, .05, 'triangle', .09),
  hard:   () => { tone(150, .08, 'sawtooth', .16, 0, -80); tone(70, .12, 'square', .1); },
  lock:   () => tone(180, .06, 'square', .1, 0, -50),
  clear:  () => [523, 659, 784].forEach((f, i) => tone(f, .09, 'square', .1, i * .06)),
  tetris: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .1, 'square', .11, i * .055)),
  level:  () => [660, 990].forEach((f, i) => tone(f, .09, 'triangle', .12, i * .08)),
  over:   () => [392, 330, 262, 175].forEach((f, i) => tone(f, .16, 'triangle', .12, i * .14)),
};

/* ============================== 타입 ============================== */
interface Piece { t:number; r:number; x:number; y:number }
interface Particle { x:number;y:number;vx:number;vy:number;rot:number;vr:number;s:number;color:string;life:number;max:number }
interface Trail { x:number; y0:number; y1:number; color:string; life:number }
interface Banner { id:number; title:string; sub:string; tetris?:boolean }
interface Input { left:boolean; right:boolean; down:boolean; last:number; dasT:number }
type Phase = 'menu'|'playing'|'paused'|'clearing'|'over';
interface G {
  board:number[][]; piece:Piece|null; queue:number[]; hold:number|null; holdUsed:boolean;
  score:number; lines:number; level:number; combo:number; b2b:boolean; newHi:boolean;
  dropT:number; lockT:number; resets:number;
  phase:Phase; clearRows:number[]; clearT:number; overT:number; shake:number;
  banner:Banner|null;
}

/* ============================== 로직 ============================== */
const newBoard = ():number[][] => Array.from({length:TOTAL}, () => Array(COLS).fill(0));
const freshGame = ():G => ({
  board:newBoard(), piece:null, queue:[], hold:null, holdUsed:false,
  score:0, lines:0, level:1, combo:-1, b2b:false, newHi:false,
  dropT:0, lockT:0, resets:0, phase:'menu', clearRows:[], clearT:0, overT:0, shake:0,
  banner:null,
});

function collide(board:number[][], m:number[][], x:number, y:number):boolean {
  for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) {
    if (!m[j][i]) continue;
    const bx = x + i, by = y + j;
    if (bx < 0 || bx >= COLS || by < 0 || by >= TOTAL || board[by][bx]) return true;
  }
  return false;
}
function placePiece(g:G, t:number) {
  const m = SHAPES[t][0], w = m[0].length;
  g.piece = { t, r:0, x:(COLS - w) >> 1, y:0 };
  g.dropT = 0; g.lockT = 0; g.resets = 0;
  if (collide(g.board, m, g.piece.x, g.piece.y)) gameOver(g);
}
function refill(g:G) {
  while (g.queue.length < 8) {
    const bag = [0,1,2,3,4,5,6];
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    g.queue.push(...bag);
  }
}
function spawn(g:G) { refill(g); placePiece(g, g.queue.shift()!); }

function resetLock(g:G) { // 접지 상태에서 이동/회전 성공 시 락 딜레이 연장
  const p = g.piece!;
  if (collide(g.board, SHAPES[p.t][p.r], p.x, p.y + 1) && g.resets < MAX_RESETS) { g.lockT = 0; g.resets++; }
}
function tryMove(g:G, dx:number, dy:number):boolean {
  if (!g.piece) return false;
  const p = g.piece, m = SHAPES[p.t][p.r];
  if (collide(g.board, m, p.x + dx, p.y + dy)) return false;
  p.x += dx; p.y += dy; resetLock(g);
  return true;
}
function tryRotate(g:G, dir:number):boolean {
  if (!g.piece) return false;
  const p = g.piece, from = p.r, to = (p.r + dir + 4) % 4;
  const table = p.t === 0 ? K_I : p.t === 3 ? { [`${from}${to}`]: [[0,0]] } : K_JLSTZ;
  const m = SHAPES[p.t][to];
  for (const [kx, ky] of table[`${from}${to}`]) {
    const nx = p.x + kx, ny = p.y - ky; // y 부호 반전 적용
    if (!collide(g.board, m, nx, ny)) { p.r = to; p.x = nx; p.y = ny; resetLock(g); return true; }
  }
  return false;
}
function hardDrop(g:G) {
  if (!g.piece) return;
  const p = g.piece, m = SHAPES[p.t][p.r];
  let d = 0;
  while (!collide(g.board, m, p.x, p.y + d + 1)) d++;
  if (d > 0) {
    const color = COLORS[TYPES[p.t]];
    for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++)
      if (m[j][i]) trails.push({ x: p.x + i, y0: p.y + j, y1: p.y + j + d, color, life: 170 });
    p.y += d; g.score += d * 2;
  }
  g.shake = Math.min(1, 0.4 + d * 0.03);
  lockPiece(g, true);
}
function doHold(g:G) {
  if (!g.piece || g.holdUsed) return;
  const cur = g.piece.t;
  if (g.hold == null) { g.hold = cur; spawn(g); }
  else { const h = g.hold; g.hold = cur; placePiece(g, h); }
  g.holdUsed = true; sfx.hold();
}
function lockPiece(g:G, hard = false) {
  const p = g.piece!, m = SHAPES[p.t][p.r];
  let allHidden = true;
  for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) if (m[j][i]) {
    const by = p.y + j, bx = p.x + i;
    if (by >= 0 && by < TOTAL && bx >= 0 && bx < COLS) g.board[by][bx] = p.t + 1;
    if (by >= HIDDEN) allHidden = false;
  }
  g.piece = null;
  hard ? sfx.hard() : sfx.lock();
  if (allHidden) { gameOver(g); return; }
  const rows:number[] = [];
  for (let r = 0; r < TOTAL; r++) if (g.board[r].every(v => v)) rows.push(r);
  g.holdUsed = false;
  if (rows.length) startClear(g, rows);
  else { g.combo = -1; spawn(g); }
}
function startClear(g:G, rows:number[]) {
  g.phase = 'clearing'; g.clearT = 0; g.clearRows = rows;
  const n = rows.length; g.combo++;
  const isTetris = n === 4;
  let pts = [0, 100, 300, 500, 800][n] * g.level;
  const tags:string[] = [];
  if (isTetris && g.b2b) { pts = Math.floor(pts * 1.5); tags.push('BACK-TO-BACK'); }
  g.b2b = isTetris;
  if (g.combo > 0) { pts += 50 * g.combo * g.level; if (g.combo >= 2) tags.push(`COMBO ×${g.combo}`); }
  g.score += pts; g.lines += n;
  const nl = Math.floor(g.lines / 10) + 1;
  let title = n === 4 ? 'TETRIS' : n === 3 ? 'TRIPLE' : n === 2 ? 'DOUBLE' : '';
  if (nl > g.level) { g.level = nl; sfx.level(); title = title ? title : `LEVEL ${nl}`; if (title !== `LEVEL ${nl}`) tags.push(`LEVEL ${nl}`); }
  // 파편 파티클
  for (const r of rows) for (let c = 0; c < COLS; c++) {
    const v = g.board[r][c], color = v ? COLORS[TYPES[v - 1]] : '#888';
    for (let k = 0; k < 2; k++) particles.push({
      x:(c + .5) * CELL, y:(r - HIDDEN + .5) * CELL,
      vx:(Math.random() - .5) * 5.5, vy:-Math.random() * 4 - 1,
      rot:Math.random() * Math.PI, vr:(Math.random() - .5) * .35,
      s:3 + Math.random() * 5, color, life:520 + Math.random() * 300, max:820,
    });
  }
  isTetris ? sfx.tetris() : sfx.clear();
  if (title) g.banner = { id: Math.random(), title, sub:['+' + pts, ...tags].join('  ·  '), tetris: n === 4 };
}
function gameOver(g:G) {
  g.phase = 'over'; g.overT = 0; sfx.over();
  if (g.score > hiRef) { hiRef = g.score; try { localStorage.setItem(HI_KEY, String(g.score)); } catch(e){}; g.newHi = true; }
}

function removeRows(g:G) {
  g.clearRows.sort((a,b) => a - b);
  for (const r of g.clearRows) { g.board.splice(r, 1); g.board.unshift(Array(COLS).fill(0)); }
  g.clearRows = [];
}

function step(g:G, dt:number, input:Input) {
  if (g.phase === 'clearing') {
    g.clearT += dt;
    if (g.clearT >= CLEAR_DUR) { removeRows(g); g.phase = 'playing'; spawn(g); }
    return;
  }
  if (g.phase === 'over') { g.overT += dt; return; }
  if (g.phase !== 'playing' || !g.piece) return;

  // DAS/ARR (좌우 길게 누르기)
  const dir = (input.last === -1 && input.left) || (input.last === 1 && input.right)
    ? input.last : (input.left && !input.right ? -1 : input.right ? 1 : 0);
  if (dir !== 0) {
    input.dasT += dt;
    if (input.dasT > DAS) while (input.dasT > DAS + ARR) { input.dasT -= ARR; if (!tryMove(g, dir, 0)) break; }
  } else input.dasT = 0;

  // 중력 낙하
  const p = g.piece;
  const base = Math.max(40, DROP_START * Math.pow(0.8, g.level - 1));
  const interval = base / (input.down ? 18 : 1);
  g.dropT += dt;
  let guard = 0;
  while (g.dropT >= interval && guard++ < 40) {
    g.dropT -= interval;
    const m = SHAPES[p.t][p.r];
    if (!collide(g.board, m, p.x, p.y + 1)) { p.y++; if (input.down) g.score += 1; g.lockT = 0; }
    else { g.dropT = 0; break; }
  }
  // 락 딜레이
  const m = SHAPES[p.t][p.r];
  if (collide(g.board, m, p.x, p.y + 1)) { g.lockT += dt; if (g.lockT >= LOCK_DELAY) lockPiece(g); }
  else g.lockT = 0;
}

/* ============================== 전역 이펙트 상태 ============================== */
let particles:Particle[] = [];
let trails:Trail[] = [];
let hiRef = 0;
try { hiRef = parseInt(localStorage.getItem(HI_KEY) || '0', 10) || 0; } catch(e){}

/* ============================== 그리기 ============================== */
function paintCell(ctx:CanvasRenderingContext2D, px:number, py:number, s:number, color:string, alpha=1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(px + 1, py + 1, s - 2, 2);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(px + 1, py + s - 3, s - 2, 2);
  ctx.globalAlpha = 1;
}
function paintGhost(ctx:CanvasRenderingContext2D, px:number, py:number, s:number, color:string) {
  ctx.globalAlpha = .09; ctx.fillStyle = color; ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
  ctx.globalAlpha = .38; ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.strokeRect(px + 2.5, py + 2.5, s - 5, s - 5);
  ctx.globalAlpha = 1;
}
function drawPreview(ctx:CanvasRenderingContext2D, t:number, cx:number, cy:number, cell:number, dim:boolean) {
  const m = SHAPES[t][0];
  let minI = 9, maxI = -1, minJ = 9, maxJ = -1;
  m.forEach((row, j) => row.forEach((v, i) => { if (v) { minI = Math.min(minI,i); maxI = Math.max(maxI,i); minJ = Math.min(minJ,j); maxJ = Math.max(maxJ,j); } }));
  const w = maxI - minI + 1, h = maxJ - minJ + 1;
  for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++)
    if (m[j][i]) paintCell(ctx, cx - w*cell/2 + (i - minI)*cell, cy - h*cell/2 + (j - minJ)*cell, cell, COLORS[TYPES[t]], dim ? .3 : 1);
}

/* ============================== 아이콘 ============================== */
const Ico = {
  pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16"/><rect x="14" y="4" width="5" height="16"/></svg>,
  on:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>,
  off: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M16 9l6 6M22 9l-6 6"/></svg>,
  left:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 5l-7 7 7 7"/></svg>,
  right: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg>,
  ccw: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5"/><path d="M4.5 9A8 8 0 1 1 4 13"/></svg>,
  cw:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 9V4h-5"/><path d="M19.5 9A8 8 0 1 0 20 13"/></svg>,
  soft:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v12M6 10l6 6 6-6"/></svg>,
  hard:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v11M6 7l6 6 6-6M5 20h14"/></svg>,
  swap:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3"/></svg>,
};

/* ============================== App ============================== */
function App() {
  const [ui, setUi] = useState({ score:0, lines:0, level:1, hold:null as number|null, holdUsed:false, next:[] as number[], combo:-1, newHi:false });
  const [phase, setPhase] = useState<Phase>('menu');
  const [banner, setBanner] = useState<Banner|null>(null);
  const [hi, setHi] = useState(hiRef);
  const [mutedS, setMutedS] = useState(false);

  const gRef = useRef<G>(freshGame());
  const input = useRef<Input>({ left:false, right:false, down:false, last:0, dasT:0 });
  const uiRef = useRef(ui);
  const phaseRef = useRef<Phase>('menu');
  const bTO = useRef<number>(0);
  const boardRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);

  const startGame = () => {
    particles = []; trails = [];
    const g = freshGame(); g.phase = 'playing'; spawn(g);
    gRef.current = g;
  };

  /* 메인 루프 */
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const cv = boardRef.current!;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d')!;

    let last = performance.now(), raf = 0;
    const loop = (now:number) => {
      const dt = Math.min(50, now - last); last = now;
      const g = gRef.current;
      step(g, dt, input.current);

      /* ---- 렌더 ---- */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0A0A0C'; ctx.fillRect(0, 0, W, H);
      if (g.shake > 0) {
        const a = g.shake * 5;
        ctx.translate((Math.random()*2-1)*a, (Math.random()*2-1)*a);
        g.shake = Math.max(0, g.shake - dt/160);
      }
      // 그리드
      ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
      for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c*CELL+.5, 0); ctx.lineTo(c*CELL+.5, H); ctx.stroke(); }
      for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*CELL+.5); ctx.lineTo(W, r*CELL+.5); ctx.stroke(); }
      // 고정 셀
      for (let r = HIDDEN; r < TOTAL; r++) for (let c = 0; c < COLS; c++) {
        const v = g.board[r][c];
        if (v) paintCell(ctx, c*CELL, (r-HIDDEN)*CELL, CELL, COLORS[TYPES[v-1]]);
      }
      // 라인 클리어 플래시
      if (g.phase === 'clearing') {
        const p = g.clearT / CLEAR_DUR;
        for (const r of g.clearRows) {
          ctx.fillStyle = `rgba(237,234,226,${(1-p)*.9})`;
          ctx.fillRect(0, (r-HIDDEN)*CELL, W, CELL);
        }
      }
      // 하드드롭 잔상
      trails = trails.filter(t => (t.life -= dt) > 0);
      for (const t of trails) {
        ctx.globalAlpha = (t.life / 170) * .3; ctx.fillStyle = t.color;
        const y0 = Math.max(t.y0, HIDDEN), y1 = Math.min(t.y1, TOTAL);
        if (y1 > y0) ctx.fillRect(t.x*CELL+3, (y0-HIDDEN)*CELL, CELL-6, (y1-y0)*CELL);
        ctx.globalAlpha = 1;
      }
      // 고스트 + 현재 피스
      if (g.piece && (g.phase === 'playing' || g.phase === 'paused')) {
        const p = g.piece, m = SHAPES[p.t][p.r];
        let gy = p.y;
        while (!collide(g.board, m, p.x, gy + 1)) gy++;
        const color = COLORS[TYPES[p.t]];
        for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) if (m[j][i]) {
          const gyj = gy + j;
          if (gyj >= HIDDEN) paintGhost(ctx, (p.x+i)*CELL, (gyj-HIDDEN)*CELL, CELL, color);
        }
        for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j].length; i++) if (m[j][i]) {
          const by = p.y + j;
          if (by >= HIDDEN) paintCell(ctx, (p.x+i)*CELL, (by-HIDDEN)*CELL, CELL, color);
        }
      }
      // 파편 파티클
      particles = particles.filter(pt => (pt.life -= dt) > 0);
      for (const pt of particles) {
        pt.x += pt.vx * dt/16; pt.y += pt.vy * dt/16; pt.vy += .22 * dt/16; pt.rot += pt.vr * dt/16;
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life / pt.max);
        ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot);
        ctx.fillStyle = pt.color; ctx.fillRect(-pt.s/2, -pt.s/2, pt.s, pt.s);
        ctx.restore();
      }
      // 게임오버: 위에서부터 회색으로 덮임
      if (g.phase === 'over') {
        const n = Math.floor(g.overT / 1000 * (TOTAL + 2));
        for (let i = 0; i < Math.min(n, TOTAL); i++) {
          if (i < HIDDEN) continue;
          ctx.fillStyle = '#232329';
          ctx.fillRect(0, (i-HIDDEN)*CELL + 1, W, CELL - 2);
        }
      }

      /* ---- React 상태 동기화 (변화 시에만) ---- */
      const prev = uiRef.current;
      const next3 = g.queue.slice(0, 3);
      const arrEq = (a:number[], b:number[]) => a.length === b.length && a.every((v,i) => v === b[i]);
      if (prev.score !== g.score || prev.lines !== g.lines || prev.level !== g.level ||
          prev.hold !== g.hold || prev.holdUsed !== g.holdUsed || prev.combo !== g.combo ||
          prev.newHi !== g.newHi || !arrEq(prev.next, next3)) {
        const u = { score:g.score, lines:g.lines, level:g.level, hold:g.hold, holdUsed:g.holdUsed, combo:g.combo, newHi:g.newHi, next:next3 };
        uiRef.current = u; setUi(u);
      }
      if (g.phase !== phaseRef.current) { phaseRef.current = g.phase; setPhase(g.phase); }
      if (g.banner) { const b = g.banner; g.banner = null; setBanner(b);
        clearTimeout(bTO.current); bTO.current = window.setTimeout(() => setBanner(null), 1250); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* 키보드 */
  useEffect(() => {
    const kd = (e:KeyboardEvent) => {
      const g = gRef.current, inp = input.current;
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      ensureAudio();
      switch (e.code) {
        case 'ArrowLeft':  inp.left = true;  inp.last = -1; inp.dasT = 0; if (g.phase==='playing' && tryMove(g,-1,0)) sfx.move(); break;
        case 'ArrowRight': inp.right = true; inp.last = 1;  inp.dasT = 0; if (g.phase==='playing' && tryMove(g, 1,0)) sfx.move(); break;
        case 'ArrowDown':
          inp.down = true;
          if (g.phase==='playing' && g.piece) {
            const p = g.piece;
            if (!collide(g.board, SHAPES[p.t][p.r], p.x, p.y+1)) { p.y++; g.score += 1; g.dropT = 0; g.lockT = 0; }
          }
          break;
        case 'ArrowUp': case 'KeyX': if (g.phase==='playing' && tryRotate(g, 1)) sfx.rotate(); break;
        case 'KeyZ': if (g.phase==='playing' && tryRotate(g,-1)) sfx.rotate(); break;
        case 'Space': if (g.phase==='playing') hardDrop(g); break;
        case 'KeyC': case 'ShiftLeft': case 'ShiftRight': if (g.phase==='playing') doHold(g); break;
        case 'KeyP': case 'Escape':
          if (g.phase==='playing') g.phase='paused';
          else if (g.phase==='paused') g.phase='playing';
          break;
        case 'Enter': if (g.phase==='menu' || g.phase==='over') startGame(); break;
      }
    };
    const ku = (e:KeyboardEvent) => {
      const inp = input.current;
      if (e.code==='ArrowLeft')  { inp.left = false;  inp.last = inp.right ? 1 : 0; inp.dasT = 0; }
      if (e.code==='ArrowRight') { inp.right = false; inp.last = inp.left ? -1 : 0; inp.dasT = 0; }
      if (e.code==='ArrowDown')  inp.down = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  /* HOLD / NEXT 미니 프리뷰 */
  useEffect(() => {
    const cv = holdRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = 120*dpr; cv.height = 66*dpr;
    const ctx = cv.getContext('2d')!; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,120,66);
    if (ui.hold != null) drawPreview(ctx, ui.hold, 60, 33, 16, ui.holdUsed);
  }, [ui.hold, ui.holdUsed]);

  useEffect(() => {
    const cv = nextRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = 120*dpr; cv.height = 168*dpr;
    const ctx = cv.getContext('2d')!; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,120,168);
    ui.next.forEach((t, i) => drawPreview(ctx, t, 60, 30 + i*55, i === 0 ? 17 : 14, false));
  }, [ui.next]);

  const togglePause = () => {
    const g = gRef.current;
    if (g.phase==='playing') g.phase='paused';
    else if (g.phase==='paused') g.phase='playing';
  };
  const toggleMute = () => { ensureAudio(); muted = !muted; setMutedS(muted); };
  const onBoardClick = () => { ensureAudio(); const g = gRef.current; if (g.phase==='menu'||g.phase==='over') startGame(); };

  /* 터치 컨트롤 */
  const touch = (action:string, down:boolean) => {
    ensureAudio();
    const g = gRef.current, inp = input.current;
    if (action==='left')  { inp.left = down;  if (down) { inp.last=-1; inp.dasT=0; if (g.phase==='playing'&&tryMove(g,-1,0)) sfx.move(); } else inp.last = inp.right?1:0; }
    if (action==='right') { inp.right = down; if (down) { inp.last= 1; inp.dasT=0; if (g.phase==='playing'&&tryMove(g, 1,0)) sfx.move(); } else inp.last = inp.left?-1:0; }
    if (action==='soft')  inp.down = down;
    if (down && action==='ccw'  && g.phase==='playing' && tryRotate(g,-1)) sfx.rotate();
    if (down && action==='cw'   && g.phase==='playing' && tryRotate(g, 1)) sfx.rotate();
    if (down && action==='hard' && g.phase==='playing') hardDrop(g);
    if (down && action==='hold' && g.phase==='playing') doHold(g);
  };
  const TBtn = ({ id, icon }:{ id:string, icon:JSX.Element }) => (
    <button
      onPointerDown={e => { e.preventDefault(); touch(id, true); }}
      onPointerUp={() => touch(id, false)}
      onPointerLeave={() => touch(id, false)}
      onPointerCancel={() => touch(id, false)}
    >{icon}</button>
  );

  const gauge = (ui.lines % 10) * 10;

  return (
    <div className="app">
      <header>
        <div className="logo">TETRIS<span className="logo-sub">REACT · TYPESCRIPT</span></div>
        <div className="hright">
          <div className="hi">HI-SCORE<b>{hi.toLocaleString()}</b></div>
          <button className="ibtn" onClick={togglePause} aria-label="일시정지">{Ico.pause}</button>
          <button className="ibtn" onClick={toggleMute} aria-label="사운드">{mutedS ? Ico.off : Ico.on}</button>
        </div>
      </header>

      <div className="stage">
        <aside className="side left">
          <div className="panel">
            <div className="ph">HOLD<span className="phs">C</span></div>
            <canvas ref={holdRef} className="mini" style={{width:'100%'}}/>
          </div>
          <div className="panel keys">
            <div className="ph">CONTROLS</div>
            <div className="krows">
              <kbd>← →</kbd><span>이동</span>
              <kbd>↓</kbd><span>소프트 드롭</span>
              <kbd>↑ / X</kbd><span>회전</span>
              <kbd>Z</kbd><span>반대 회전</span>
              <kbd>SPACE</kbd><span>하드 드롭</span>
              <kbd>C</kbd><span>홀드</span>
              <kbd>P</kbd><span>일시정지</span>
            </div>
          </div>
        </aside>

        <div className="boardWrap" onClick={onBoardClick}>
          <canvas ref={boardRef} className="board" style={{height:'min(76vh,640px)'}}/>
          {banner && (
            <div key={banner.id} className={'banner' + (banner.tetris ? ' tetris' : '')}>
              <div className="bt">{banner.title}</div>
              <div className="bs">{banner.sub}</div>
            </div>
          )}
          {phase === 'menu' && (
            <div className="overlay">
              <div className="ot">TETRIS</div>
              <div className="od">7-BAG · SRS 회전 · 홀드 · 고스트<br/>기록은 이 브라우저에 저장됩니다</div>
              <button onClick={e => { e.stopPropagation(); ensureAudio(); startGame(); }}>START</button>
              <div className="od">ENTER 키 또는 클릭</div>
            </div>
          )}
          {phase === 'paused' && (
            <div className="overlay">
              <div className="ot">PAUSED</div>
              <div className="od">P 키 또는 상단 버튼으로 계속</div>
            </div>
          )}
          {phase === 'over' && (
            <div className="overlay over">
              <div className="ot">GAME OVER</div>
              {ui.newHi && <div className="rec">— NEW RECORD —</div>}
              <div className="os">{ui.score.toLocaleString()}</div>
              <div className="od">LINES {ui.lines} · LEVEL {ui.level}</div>
              <button onClick={e => { e.stopPropagation(); ensureAudio(); startGame(); }}>RETRY</button>
              <div className="od">ENTER 키 또는 클릭</div>
            </div>
          )}
        </div>

        <aside className="side right">
          <div className="panel">
            <div className="ph">SCORE</div>
            <div className="big">{ui.score.toLocaleString()}</div>
          </div>
          <div className="duo">
            <div className="panel">
              <div className="ph">LEVEL</div>
              <div className="big">{ui.level}</div>
            </div>
            <div className="panel">
              <div className="ph">LINES</div>
              <div className="big">{ui.lines}</div>
              <div className="gauge"><i style={{width: gauge + '%'}}/></div>
            </div>
          </div>
          <div className="panel">
            <div className="ph">NEXT</div>
            <canvas ref={nextRef} className="mini" style={{width:'100%'}}/>
          </div>
        </aside>
      </div>

      <div className="touch">
        <TBtn id="left" icon={Ico.left}/>
        <TBtn id="right" icon={Ico.right}/>
        <TBtn id="ccw" icon={Ico.ccw}/>
        <TBtn id="cw" icon={Ico.cw}/>
        <TBtn id="soft" icon={Ico.soft}/>
        <TBtn id="hard" icon={Ico.hard}/>
        <TBtn id="hold" icon={Ico.swap}/>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
