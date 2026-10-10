const { useState, useEffect, useRef, useCallback } = React;

/* ============================== 상수 ============================== */
const COLS = 10, ROWS = 20;
const LOCK_DELAY = 480;   // 바닥에 닿은 뒤 고정까지의 시간(ms)
const DAS = 165, ARR = 42; // 좌우 자동 반복 타이밍

const IDS = ['I','J','L','O','S','T','Z'];
// LCD 단색 팔레트 안에서 조각별 농도만 다르게 — 진정한 모노크롬 유지
const COLORS = ['#2e331f','#3c4227','#4a5130','#585f39','#676e44','#767d50','#85895d'];

const SHAPES: Record<string, number[][]> = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
  O: [[1,1],[1,1]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
};

// SRS 월킥 테이블 (SRS 기준 y+는 위쪽 → 적용 시 부호 반전)
const KICKS_JLSTZ: Record<string, [number,number][]> = {
  '01': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '10': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '12': [[0,0],[1,0],[1,-1],[0,2],[1,2]],     '21': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '23': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],    '32': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '30': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  '03': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KICKS_I: Record<string, [number,number][]> = {
  '01': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   '10': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '12': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   '21': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '23': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   '32': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '30': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   '03': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

// 각 조각의 4개 회전 상태를 미리 계산
function rotateMat(m: number[][], dir: 1 | -1): number[][] {
  const n = m.length, r: number[][] = Array.from({length:n}, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (dir === 1) r[x][n-1-y] = m[y][x];
    else r[n-1-x][y] = m[y][x];
  }
  return r;
}
const MATS: number[][][] = IDS.map(s => {
  let m = SHAPES[s]; const out = [m];
  for (let i = 1; i < 4; i++) { m = rotateMat(m, 1); out.push(m); }
  return out;
});

// 대기 화면에 깔릴 장식용 잔해
const DEMO_ROWS = [
  '..........','..........','..........','..........','..........',
  '..........','..........','..........','..........','..........',
  '..........','..........','.......2..','....55....',
  '.....55..7','.6..55..77','.66.44..77','3661441117','3361441117','3361111117'
];

/* ============================== 사운드 ============================== */
let SND = true;
let AC: AudioContext | null = null;
function actx(): AudioContext | null {
  try {
    if (!AC) AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    return AC;
  } catch { return null; }
}
function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.045, at = 0) {
  if (!SND) return;
  const c = actx(); if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  move:  () => tone(190, .03, 'square', .025),
  rot:   () => tone(340, .05, 'square', .04),
  hard:  () => tone(85,  .09, 'triangle', .09),
  lock:  () => tone(120, .05, 'triangle', .07),
  hold:  () => tone(500, .04, 'square', .035),
  pause: () => tone(300, .06, 'square', .04),
  clear: (n: number) => {
    [523, 659, 784].slice(0, n).forEach((f, i) => tone(f, .09, 'square', .05, i * .07));
    if (n >= 4) tone(1047, .1, 'square', .05, .21), tone(1319, .28, 'square', .05, .31);
  },
  level: () => { tone(659, .08, 'square', .05); tone(880, .13, 'square', .05, .09); },
  start: () => { tone(392, .07, 'square', .05); tone(523, .1, 'square', .05, .08); },
  over:  () => { [330, 262, 196].forEach((f, i) => tone(f, .18, 'triangle', .06, i * .14)); },
};

/* ============================== 게임 상태 ============================== */
type Phase = 'idle'|'running'|'paused'|'clearing'|'dying'|'over';
type Board = number[][];
interface Active { id: number; rot: number; x: number; y: number; }
interface Game {
  board: Board; active: Active | null; queue: number[]; hold: number | null; holdUsed: boolean;
  score: number; lines: number; level: number;
  dropAcc: number; lockT: number; resets: number;
  phase: Phase; clearT: number; dieRow: number; dieT: number;
  dirty: boolean; shakeReq: boolean;
}
interface Snap {
  grid: number[][]; score: number; lines: number; level: number;
  phase: Phase; next: number[]; hold: number | null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function refill(G: Game) { while (G.queue.length < 5) G.queue.push(...shuffle([1,2,3,4,5,6,7])); }

function freshGame(demo: boolean): Game {
  const board: Board = demo
    ? DEMO_ROWS.map(r => r.split('').map(c => c === '.' ? 0 : +c))
    : Array.from({length: ROWS}, () => Array(COLS).fill(0));
  const G: Game = {
    board, active: null, queue: [], hold: null, holdUsed: false,
    score: 0, lines: 0, level: 1,
    dropAcc: 0, lockT: 0, resets: 0,
    phase: demo ? 'idle' : 'running', clearT: 0, dieRow: 0, dieT: 0,
    dirty: true, shakeReq: false,
  };
  refill(G); // 대기 화면에서도 NEXT가 살아 있도록
  return G;
}

function collides(board: Board, m: number[][], px: number, py: number): boolean {
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
    if (!m[y][x]) continue;
    const bx = px + x, by = py + y;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}
function stamp(grid: Board, m: number[][], px: number, py: number, v: number) {
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
    if (!m[y][x]) continue;
    const by = py + y, bx = px + x;
    if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) grid[by][bx] = v;
  }
}

function spawn(G: Game, forced?: number) {
  refill(G);
  const id = forced ?? G.queue.shift()!;
  const sz = MATS[id-1][0].length;
  const x = Math.floor((COLS - sz) / 2), y = -1;
  if (collides(G.board, MATS[id-1][0], x, y)) { startDying(G); return; }
  G.active = { id, rot: 0, x, y };
  G.lockT = 0; G.resets = 0; G.dropAcc = 0;
  G.dirty = true;
}
function afterAction(G: Game) {
  const a = G.active!;
  if (collides(G.board, MATS[a.id-1][a.rot], a.x, a.y+1)) {
    if (G.resets < 15) G.lockT = 0; // 무한 리셋 방지
    G.resets++;
  } else { G.lockT = 0; G.resets = 0; }
}
function tryMove(G: Game, dx: number): boolean {
  if (G.phase !== 'running' || !G.active) return false;
  const a = G.active, m = MATS[a.id-1][a.rot];
  if (collides(G.board, m, a.x+dx, a.y)) return false;
  a.x += dx; afterAction(G); G.dirty = true;
  return true;
}
function tryRotate(G: Game, dir: 1 | -1): boolean {
  if (G.phase !== 'running' || !G.active) return false;
  const a = G.active;
  if (a.id === 4) { sfx.rot(); return true; } // O는 제자일 회전
  const from = a.rot, to = (a.rot + dir + 4) % 4;
  const kicks = (a.id === 1 ? KICKS_I : KICKS_JLSTZ)[`${from}${to}`];
  const m = MATS[a.id-1][to];
  for (const [dx, dy] of kicks) {
    const nx = a.x + dx, ny = a.y - dy; // SRS의 y+는 위쪽이므로 부호 반전
    if (!collides(G.board, m, nx, ny)) {
      a.rot = to; a.x = nx; a.y = ny;
      afterAction(G); sfx.rot(); G.dirty = true;
      return true;
    }
  }
  return false;
}
function startDying(G: Game) {
  G.phase = 'dying'; G.dieRow = ROWS - 1; G.dieT = 0;
  G.active = null; G.dirty = true; sfx.over();
}
function lockPiece(G: Game) {
  const a = G.active!; const m = MATS[a.id-1][a.rot];
  let dead = false;
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
    if (!m[y][x]) continue;
    const by = a.y + y, bx = a.x + x;
    if (by < 0) { dead = true; continue; }
    G.board[by][bx] = a.id;
  }
  G.active = null;
  if (dead) { startDying(G); return; }
  sfx.lock();
  const full: number[] = [];
  for (let y = 0; y < ROWS; y++) if (G.board[y].every(c => c > 0)) full.push(y);
  if (full.length) {
    for (const y of full) G.board[y] = G.board[y].map(() => 8); // 점멸용 특수 값
    G.score += [0, 100, 300, 500, 800][full.length] * G.level;
    G.phase = 'clearing'; G.clearT = 360;
    sfx.clear(full.length);
  } else { G.holdUsed = false; spawn(G); }
  G.dirty = true;
}
function finishClear(G: Game) {
  const n = G.board[0] ? 0 : 0; // (자리표시 없음)
  const rows = G.board.reduce((acc, row, y) => { if (row.every(c => c === 8)) acc.push(y); return acc; }, [] as number[]);
  for (const y of rows) { G.board.splice(y, 1); G.board.unshift(Array(COLS).fill(0)); }
  G.lines += rows.length;
  const nl = Math.min(15, 1 + Math.floor(G.lines / 10));
  if (nl > G.level) { G.level = nl; sfx.level(); }
  G.phase = 'running'; G.holdUsed = false;
  spawn(G); G.dirty = true;
}
function hardDrop(G: Game) {
  if (G.phase !== 'running' || !G.active) return;
  const a = G.active, m = MATS[a.id-1][a.rot];
  let n = 0;
  while (!collides(G.board, m, a.x, a.y+1)) { a.y++; n++; }
  G.score += n * 2;
  G.shakeReq = true;
  sfx.hard();
  lockPiece(G);
}
function doHold(G: Game) {
  if (G.phase !== 'running' || G.holdUsed || !G.active) return;
  const cur = G.active.id;
  if (G.hold == null) { G.hold = cur; spawn(G); }
  else { const h = G.hold; G.hold = cur; spawn(G, h); }
  G.holdUsed = true; sfx.hold(); G.dirty = true;
}
function stepRun(G: Game, dt: number, K: any) {
  // DAS: 첫 이동은 입력 시, 이후 자동 반복
  if (K.dir) {
    K.dasT += dt;
    if (K.dasT >= DAS) {
      K.repT += dt;
      while (K.repT >= ARR) { K.repT -= ARR; if (tryMove(G, K.dir)) sfx.move(); }
    }
  }
  const gms = 720 * Math.pow(0.8, G.level - 1);
  const spd = K.down ? Math.min(35, gms) : gms;
  G.dropAcc += dt;
  while (G.dropAcc >= spd && G.phase === 'running') {
    G.dropAcc -= spd;
    const a = G.active!;
    if (!collides(G.board, MATS[a.id-1][a.rot], a.x, a.y+1)) {
      a.y++;
      if (K.down) G.score++;
    } else break;
  }
  if (G.phase !== 'running') return;
  const a = G.active!;
  if (collides(G.board, MATS[a.id-1][a.rot], a.x, a.y+1)) {
    G.lockT += dt;
    if (G.lockT >= LOCK_DELAY) lockPiece(G);
  } else G.lockT = 0;
}
function stepDying(G: Game, dt: number) {
  G.dieT += dt;
  while (G.dieT >= 34 && G.dieRow >= 0) { // 아래에서 위로 픽셀 소거
    G.dieT -= 34;
    G.board[G.dieRow] = Array(COLS).fill(1);
    G.dieRow--; G.dirty = true;
  }
  if (G.dieRow < 0) { G.phase = 'over'; G.dirty = true; }
}

/* ============================== UI ============================== */
const pad = (n: number, w: number) => String(Math.max(0, Math.floor(n))).padStart(w, '0');

function makeSnap(G: Game): Snap {
  const grid: number[][] = G.board.map(r => r.slice());
  if ((G.phase === 'running' || G.phase === 'paused') && G.active) {
    const a = G.active, m = MATS[a.id-1][a.rot];
    let gy = a.y;
    while (!collides(G.board, m, a.x, gy + 1)) gy++;
    stamp(grid, m, a.x, gy, -1); // 고스트
    stamp(grid, m, a.x, a.y, a.id);
  }
  return { grid, score: G.score, lines: G.lines, level: G.level, phase: G.phase, next: G.queue.slice(0, 3), hold: G.hold };
}

const Cell = React.memo(function Cell({ v }: { v: number }) {
  if (v === 0)  return <div className="cell" />;
  if (v === -1) return <div className="cell ghost" />;
  if (v === 8)  return <div className="cell f8" />;
  return <div className="cell on" style={{ background: COLORS[v-1] }} />;
});

const BoardGrid = React.memo(function BoardGrid({ grid }: { grid: number[][] }) {
  return (
    <div className="board">
      {grid.map((row, y) => row.map((v, x) => <Cell key={x + '-' + y} v={v} />))}
    </div>
  );
});

function MiniPiece({ id }: { id: number | null }) {
  let mat: number[][] | null = null;
  if (id) mat = MATS[id-1][0];
  let minR = 4, maxR = -1, minC = 4, maxC = -1;
  if (mat) {
    for (let y = 0; y < mat.length; y++) for (let x = 0; x < mat.length; x++)
      if (mat[y][x]) { minR = Math.min(minR, y); maxR = Math.max(maxR, y); minC = Math.min(minC, x); maxC = Math.max(maxC, x); }
  }
  const offR = Math.floor((4 - (maxR - minR + 1)) / 2) - minR;
  const offC = Math.floor((4 - (maxC - minC + 1)) / 2) - minC;
  return (
    <div className="mini">
      {Array.from({ length: 16 }, (_, i) => {
        const y = i >> 2, x = i & 3;
        const on = mat && mat[y - offR] && mat[y - offR][x - offC];
        return <div key={i} className={'mcell' + (on ? ' on' : '')} style={on && id ? { background: COLORS[id-1] } : undefined} />;
      })}
    </div>
  );
}

/* ============================== App ============================== */
const KEYMAP: Record<string, string> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  ArrowUp: 'rotA', KeyX: 'rotA', KeyZ: 'rotB',
  Space: 'drop', KeyC: 'hold', KeyP: 'pause', Enter: 'start',
};

function App() {
  const gRef = useRef<Game | null>(null);
  if (!gRef.current) gRef.current = freshGame(true);
  const g = gRef as React.MutableRefObject<Game>;

  const keys = useRef({ left: false, right: false, down: false, dir: 0, dasT: 0, repT: 0 });
  const [snap, setSnap] = useState<Snap>(() => makeSnap(g.current));
  const [pressed, setPressed] = useState<Set<string>>(() => new Set());
  const [sndOn, setSndOn] = useState(true);
  const [shaking, setShaking] = useState(false);
  const stRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const press = useCallback((a: string, down: boolean) => {
    const G = g.current;
    setPressed(p => { const n = new Set(p); down ? n.add(a) : n.delete(a); return n; });

    if (a === 'left' || a === 'right') {
      const d = a === 'left' ? -1 : 1;
      if (down) {
        keys.current[a] = true;
        keys.current.dir = d; keys.current.dasT = 0; keys.current.repT = 0;
        if (tryMove(G, d)) sfx.move();
      } else {
        keys.current[a] = false;
        if (keys.current.dir === d) {
          keys.current.dir = keys.current.left ? -1 : keys.current.right ? 1 : 0;
          keys.current.dasT = 0; keys.current.repT = 0;
        }
      }
      return;
    }
    if (a === 'down') { keys.current.down = down; return; }
    if (!down) return;

    switch (a) {
      case 'rotA': tryRotate(G, 1); break;
      case 'rotB': tryRotate(G, -1); break;
      case 'drop': hardDrop(G); break;
      case 'hold': doHold(G); break;
      case 'pause':
        if (G.phase === 'running') { G.phase = 'paused'; G.dirty = true; sfx.pause(); }
        else if (G.phase === 'paused') { G.phase = 'running'; G.dirty = true; }
        break;
      case 'start':
        if (G.phase === 'idle' || G.phase === 'over') {
          const blank = freshGame(false);
          g.current = blank; spawn(blank); sfx.start();
        } else if (G.phase === 'paused') { G.phase = 'running'; G.dirty = true; }
        break;
      case 'snd':
        SND = !SND; setSndOn(SND);
        if (SND) sfx.rot();
        break;
    }
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      press(a, true);
    };
    const ku = (e: KeyboardEvent) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      press(a, false);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [press]);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(50, t - last); last = t;
      const G = g.current;
      if (G.phase === 'running') stepRun(G, dt, keys.current);
      else if (G.phase === 'clearing') { G.clearT -= dt; if (G.clearT <= 0) finishClear(G); }
      else if (G.phase === 'dying') stepDying(G, dt);
      if (G.shakeReq) {
        G.shakeReq = false;
        setShaking(true);
        if (stRef.current) clearTimeout(stRef.current);
        stRef.current = setTimeout(() => setShaking(false), 190);
      }
      if (G.dirty) { G.dirty = false; setSnap(makeSnap(G)); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const btn = (a: string) => ({
    tabIndex: -1 as const,
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); press(a, true); },
    onPointerUp: () => press(a, false),
    onPointerCancel: () => press(a, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    className: undefined as string | undefined,
  });

  return (
    <div className={'console' + (shaking ? ' shake' : '')}>
      <span className="screw s-tl" /><span className="screw s-tr" />
      <span className="screw s-bl" /><span className="screw s-br" />

      <header className="brand">
        <div>
          <div className="brand-name">ЭЛЕКТРОНИКА</div>
          <div className="brand-sub">ТЕТРИС · TETRIS · ИГРА № 1</div>
        </div>
        <div className="brand-right">
          <span className="star">★</span>
          <div className="plate">ТИП-84<br />ВЦ АН СССР</div>
        </div>
      </header>

      <div className="bezel">
        <div className="lcd">
          <div className="side side-l">
            <div className="panel">
              <div className="plabel">HOLD</div>
              <MiniPiece id={snap.hold} />
            </div>
            <div className="panel">
              <div className="plabel">SCORE</div>
              <div className="pval">{pad(snap.score, 6)}</div>
            </div>
            <div className="panel">
              <div className="plabel">LINES</div>
              <div className="pval">{pad(snap.lines, 3)}</div>
            </div>
            <div className="panel">
              <div className="plabel">LEVEL</div>
              <div className="pval">{pad(snap.level, 2)}</div>
            </div>
          </div>

          <div className="board-wrap">
            <BoardGrid grid={snap.grid} />
            {snap.phase === 'idle' && (
              <div className="overlay">
                <div className="ov-title ov-blink">PRESS START</div>
                <div className="ov-sub">1984 · MOSCOW · USSR</div>
              </div>
            )}
            {snap.phase === 'paused' && (
              <div className="overlay">
                <div className="ov-title">PAUSE</div>
                <div className="ov-sub ov-blink">PRESS START</div>
              </div>
            )}
            {snap.phase === 'over' && (
              <div className="overlay">
                <div className="ov-title">GAME OVER</div>
                <div className="ov-sub">SCORE {pad(snap.score, 6)}</div>
                <div className="ov-sub ov-blink">PRESS START</div>
              </div>
            )}
          </div>

          <div className="side side-r">
            <div className="plabel">NEXT</div>
            {snap.next.map((id, i) => <MiniPiece key={i} id={id} />)}
          </div>
        </div>
        <div className="bezel-label">ЖК-ДИСПЛЕЙ · LIQUID CRYSTAL</div>
      </div>

      <div className="parting" />

      <div className="controls">
        <div className="rwrap">
          <div className="dpad">
            <button {...btn('rotA')}   className={'dp up'    + (pressed.has('rotA') ? ' pressed' : '')} />
            <button {...btn('left')}   className={'dp left'  + (pressed.has('left') ? ' pressed' : '')} />
            <div className="dp center" />
            <button {...btn('right')}  className={'dp right' + (pressed.has('right') ? ' pressed' : '')} />
            <button {...btn('down')}   className={'dp down'  + (pressed.has('down') ? ' pressed' : '')} />
          </div>
          <span className="engrave">MOVE · ROTATE</span>
        </div>

        <div className="mid">
          <div className="mid-row">
            <button {...btn('start')} className={'pill' + (pressed.has('start') ? ' pressed' : '')}>START</button>
            <button {...btn('pause')} className={'pill' + (pressed.has('pause') ? ' pressed' : '')}>PAUSE</button>
          </div>
          <button {...btn('snd')} className={'pill snd' + (pressed.has('snd') ? ' pressed' : '')}>
            <span className={'led' + (sndOn ? ' on' : '')} />SOUND
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div className="rwrap">
            <button {...btn('hold')} className={'rbtn hold' + (pressed.has('hold') ? ' pressed' : '')} />
            <span className="engrave">HOLD</span>
          </div>
          <div className="rwrap">
            <button {...btn('drop')} className={'rbtn drop' + (pressed.has('drop') ? ' pressed' : '')} />
            <span className="engrave">DROP</span>
          </div>
        </div>
      </div>

      <footer className="foot">СДЕЛАНО В СССР · МОСКВА · 1984</footer>

      <div className="help">
        <kbd>←</kbd><kbd>→</kbd> 이동<span className="sep">·</span><kbd>↓</kbd> 소프트 드롭<span className="sep">·</span>
        <kbd>↑</kbd><kbd>X</kbd> 회전<span className="sep">·</span><kbd>Z</kbd> 반대 회전<span className="sep">·</span>
        <kbd>SPACE</kbd> 하드 드롭<span className="sep">·</span><kbd>C</kbd> 홀드<span className="sep">·</span>
        <kbd>P</kbd> 일시정지<span className="sep">·</span><kbd>ENTER</kbd> 시작
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
