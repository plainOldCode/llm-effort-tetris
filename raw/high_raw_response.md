단일 HTML 파일 안에서 React 18 + TypeScript(Babel Standalone로 트랜스파일)로 돌아가는 테트리스를 만들었습니다. 디자인은 흔한 네온 사이버펑크 대신, **"잉크 아케이드 — 인쇄물 컨셉"**으로 잡았습니다. 크림색 종이 위에 잉크 팔레트 블록이 찍히고, 라인 클리어마다 도장(스탬프)이 쾅 찍히는 게임입니다.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TETRIS — 잉크 아케이드</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;700&family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --paper:#efe8da; --paper2:#f5f0e6; --ink:#1b1712; --ink-soft:rgba(27,23,18,.55);
    --verm:#cf4429; --cell:clamp(17px, 3.7vmin, 27px);
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--paper); color:var(--ink); min-height:100vh; }
  /* 종이 노이즈 질감 */
  body::after{ content:""; position:fixed; inset:0; z-index:99; pointer-events:none; opacity:.05;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .page{ max-width:1060px; margin:0 auto; padding:26px 20px 44px; }

  /* ── 마스트헤드 ── */
  .masthead-rule{ display:flex; justify-content:space-between; gap:12px; border-top:2px solid var(--ink); border-bottom:1px solid var(--ink);
    padding:5px 2px; font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:.12em; color:var(--ink-soft); }
  .masthead{ display:flex; align-items:center; gap:22px; margin-top:14px; }
  h1{ font-family:'Archivo Black'; font-size:clamp(44px,8vw,76px); line-height:.9; margin:0; letter-spacing:.01em; }
  h1 .dot{ color:var(--verm); }
  .roundstamp{ width:74px; height:74px; flex:none; animation:spin 40s linear infinite; }
  @keyframes spin{ to{ transform:rotate(360deg); } }
  .sound{ margin-left:auto; font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:.15em;
    border:1px solid var(--ink); background:transparent; color:var(--ink); padding:7px 11px; cursor:pointer; }
  .sound.off{ color:var(--ink-soft); border-color:rgba(27,23,18,.35); }
  .deck{ font-family:'IBM Plex Sans KR'; font-size:13px; color:var(--ink-soft); margin:10px 0 28px; }

  /* ── 레이아웃 ── */
  .layout{ display:flex; gap:34px; justify-content:center; align-items:flex-start; }
  .side{ width:176px; display:flex; flex-direction:column; gap:18px; padding-top:4px; }
  .panel{ border-top:3px solid var(--ink); padding-top:8px; }
  .panel.duet{ display:flex; gap:22px; }
  .label{ font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:.22em; color:var(--ink-soft); margin-bottom:7px; }
  .value{ font-family:'IBM Plex Mono'; font-weight:700; font-size:25px; font-variant-numeric:tabular-nums; line-height:1.1; }
  .value.sm{ font-size:19px; }
  .keys{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; }
  .keys li{ display:flex; justify-content:space-between; align-items:center; font-size:12px; font-family:'IBM Plex Sans KR'; color:var(--ink-soft); }
  .kk{ font-family:'IBM Plex Mono'; font-size:10px; border:1px solid rgba(27,23,18,.4); padding:2px 5px; color:var(--ink); background:rgba(27,23,18,.04); white-space:nowrap; }

  /* ── 보드 ── */
  .board-wrap{ position:relative; border:3px solid var(--ink); background:var(--paper2); padding:8px; box-shadow:8px 8px 0 rgba(27,23,18,.14); }
  .board{ display:flex; flex-direction:column;
    background-image:linear-gradient(rgba(27,23,18,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(27,23,18,.06) 1px, transparent 1px);
    background-size:var(--cell) var(--cell); }
  .brow{ display:flex; height:var(--cell); }
  .cell{ width:var(--cell); height:var(--cell); }
  .cell.filled{ border:1px solid var(--ink);
    box-shadow:inset -4px -4px 0 rgba(0,0,0,.18), inset 3px 3px 0 rgba(255,255,255,.25); }
  .cell.ghost{ border:1px dashed rgba(27,23,18,.5);
    background:repeating-linear-gradient(45deg, transparent 0 4px, rgba(27,23,18,.14) 4px 6px); }
  .brow.clearing .cell{ animation:wipe .26s linear both; }
  @keyframes wipe{ 0%,45%{ background:var(--ink)!important; box-shadow:none; border-color:var(--ink); }
    100%{ background:transparent!important; box-shadow:none; border-color:transparent; } }

  /* ── 스탬프 (시그니처) ── */
  .stamp{ position:absolute; left:50%; top:38%; z-index:5; pointer-events:none; text-align:center; white-space:nowrap;
    font-family:'Archivo Black'; font-size:29px; color:var(--verm); border:4px solid var(--verm);
    background:rgba(245,240,230,.9); padding:6px 18px 9px; mix-blend-mode:multiply;
    transform:translate(-50%,-50%) rotate(-6deg);
    animation:stampin .28s cubic-bezier(.25,1.7,.45,1) both, stampout .3s ease-in .95s both; }
  .stamp.big{ color:var(--paper2); background:var(--verm); border-color:var(--ink); font-size:36px;
    animation:stampin .28s cubic-bezier(.25,1.7,.45,1) both, stampout .35s ease-in 1.3s both; }
  .stamp span{ display:block; font-family:'IBM Plex Mono'; font-size:12px; margin-top:3px; letter-spacing:.08em; }
  @keyframes stampin{ 0%{ opacity:0; transform:translate(-50%,-50%) rotate(-14deg) scale(2.4); }
    55%{ opacity:1; transform:translate(-50%,-50%) rotate(-6deg) scale(.94); }
    100%{ opacity:1; transform:translate(-50%,-50%) rotate(-6deg) scale(1); } }
  @keyframes stampout{ to{ opacity:0; transform:translate(-50%,-50%) rotate(-6deg) scale(.9); } }

  /* ── 오버레이 ── */
  .overlay{ position:absolute; inset:0; z-index:6; background:rgba(239,232,218,.94);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:13px; padding:20px; text-align:center; }
  .ov-title{ font-family:'Archivo Black'; font-size:34px; }
  .ov-title.dead{ color:var(--verm); border:3px solid var(--verm); padding:4px 16px; transform:rotate(-4deg); }
  .overlay p{ margin:0; font-family:'IBM Plex Sans KR'; font-size:13px; color:var(--ink-soft); }
  .overlay p b{ font-family:'IBM Plex Mono'; color:var(--ink); }
  .swatches{ display:flex; gap:4px; margin-top:2px; }
  .swatches i{ width:14px; height:14px; border:1px solid var(--ink); }
  .btn{ font-family:'IBM Plex Sans KR'; font-weight:700; font-size:15px; color:var(--paper2); background:var(--ink);
    border:none; padding:12px 26px; cursor:pointer; box-shadow:4px 4px 0 var(--verm); transition:transform .12s, box-shadow .12s; }
  .btn:hover{ transform:translate(-2px,-2px); box-shadow:6px 6px 0 var(--verm); }
  .btn:active{ transform:translate(1px,1px); box-shadow:2px 2px 0 var(--verm); }
  .hint{ font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:.2em; color:var(--ink-soft); }

  /* ── 미니 피스 ── */
  .mini{ display:flex; flex-direction:column; gap:2px; padding:4px 0; }
  .mini.dim{ opacity:.3; }
  .mini.empty{ font-family:'IBM Plex Mono'; color:var(--ink-soft); font-size:13px; }
  .mrow{ display:flex; gap:2px; }
  .mcell{ width:13px; height:13px; }
  .mcell.on{ border:1px solid var(--ink); box-shadow:inset -2px -2px 0 rgba(0,0,0,.18), inset 2px 2px 0 rgba(255,255,255,.25); }
  .nexts{ display:flex; flex-direction:column; gap:8px; align-items:flex-start; }

  /* ── 터치 컨트롤 ── */
  .touch{ display:none; }
  .touch button{ width:52px; height:52px; border:2px solid var(--ink); background:var(--paper2); color:var(--ink);
    display:flex; align-items:center; justify-content:center; box-shadow:3px 3px 0 rgba(27,23,18,.2);
    touch-action:none; font-family:'Archivo Black'; font-size:15px; cursor:pointer; }
  .touch button:active{ transform:translate(2px,2px); box-shadow:none; }
  .touch svg{ width:22px; height:22px; }

  @media (max-width:880px){
    .layout{ flex-direction:column; align-items:center; gap:20px; }
    .masthead{ flex-wrap:wrap; gap:14px; }
    .side{ width:100%; max-width:352px; flex-direction:row; gap:14px; }
    .side .panel{ flex:1; border-top-width:2px; }
    .side .panel.keys{ display:none; }
    .side.right{ order:2; }
    .side.left{ order:0; }
    .board-wrap{ order:1; }
    .touch{ order:3; display:flex; gap:8px; margin:18px 0 6px; flex-wrap:wrap; justify-content:center; }
  }
</style>
</head>
<body>
<div id="root"></div>

<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>
  // TypeScript(X) 프리셋 등록 — JSX와 TS를 함께 컴파일하기 위함
  Babel.registerPreset('tsx', {
    presets: [
      [Babel.availablePresets['typescript'], { allExtensions: true, isTSX: true }],
      [Babel.availablePresets['react'], { runtime: 'classic' }],
    ],
  });
</script>
<script type="text/babel" data-presets="tsx">
const { useState, useRef, useEffect, useReducer } = React;

/* ══════════ 상수 · 타입 ══════════ */
const COLS = 10, ROWS = 20;
const PIECES = ['I','O','T','S','Z','J','L'] as const;
type PieceKey = typeof PIECES[number];
type CellVal = 0 | PieceKey;
type Ghost = 'G';

const SHAPES: Record<PieceKey, number[][]> = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]],
};
/* 인쇄 잉크 팔레트 — 7색으로 제한해 통일감 유지 */
const COLORS: Record<PieceKey, string> = {
  I:'#23756d', O:'#dfa32b', T:'#cf4429', S:'#7c8a3d', Z:'#8e3b2c', J:'#35558f', L:'#d07a2d',
};
const CLEAR_PTS  = [0, 100, 300, 500, 800];
const CLEAR_NAME = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

interface Piece { key: PieceKey; matrix: number[][]; x: number; y: number; }
interface G {
  board: CellVal[][]; piece: Piece | null; queue: PieceKey[];
  hold: PieceKey | null; canHold: boolean;
  score: number; lines: number; level: number;
  phase: 'ready'|'playing'|'clearing'|'paused'|'over';
  clearingRows: number[]; groundedMs: number;
  stamp: { text: string; sub?: string; big?: boolean; id: number } | null;
}

/* ══════════ 순수 로직 ══════════ */
let bag: PieceKey[] = [];
function drawKey(): PieceKey {              // 7-bag 랜덤라이저
  if (!bag.length) {
    bag = [...PIECES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop()!;
}
const makePiece = (k: PieceKey): Piece => ({
  key: k, matrix: SHAPES[k].map(r => [...r]),
  x: Math.floor((COLS - SHAPES[k][0].length) / 2), y: 0,
});
function collides(m: number[][], x: number, y: number, board: CellVal[][]): boolean {
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
    if (!m[r][c]) continue;
    const nx = x + c, ny = y + r;
    if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
    if (ny >= 0 && board[ny][nx]) return true;
  }
  return false;
}
const rotCW  = (m: number[][]): number[][] => m[0].map((_, c) => m.map(r => r[c]).reverse());
const rotCCW = (m: number[][]): number[][] => m[0].map((_, c) => m.map(r => r[r.length - 1 - c]));
const initGame = (): G => ({
  board: Array.from({ length: ROWS }, () => Array<CellVal>(COLS).fill(0)),
  piece: null, queue: [], hold: null, canHold: true,
  score: 0, lines: 0, level: 1, phase: 'ready', clearingRows: [], groundedMs: 0, stamp: null,
});
const pad = (n: number) => String(Math.min(n, 9999999)).padStart(7, '0');

/* ══════════ 사운드 (Web Audio) ══════════ */
const Sfx = (() => {
  let ctx: AudioContext | null = null, muted = false;
  const ensure = () => {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  };
  const tone = (f: number, delay: number, dur: number, type: OscillatorType, vol: number) => {
    if (muted || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  };
  return {
    ensure,
    toggle: () => (muted = !muted),
    move:   () => tone(160, 0, .04, 'square', .018),
    rotate: () => tone(300, 0, .05, 'square', .028),
    lock:   () => tone(110, 0, .08, 'triangle', .06),
    drop:   () => tone(70, 0, .1, 'sawtooth', .05),
    clear:  (n: number) => [523,659,784,1046].slice(0, n + 1).forEach((f, i) => tone(f, i * .06, .12, 'square', .04)),
    levelup:() => [392,523,659,784].forEach((f, i) => tone(f, i * .08, .15, 'triangle', .05)),
    over:   () => [330,262,196,131].forEach((f, i) => tone(f, i * .15, .25, 'sawtooth', .04)),
  };
})();

/* ══════════ 미니 피스 ══════════ */
function Mini({ k, dim }: { k: PieceKey | null; dim?: boolean }) {
  if (!k) return <div className="mini empty"><span>—</span></div>;
  const m = SHAPES[k];
  return (
    <div className={'mini' + (dim ? ' dim' : '')}>
      {m.map((row, y) => (
        <div className="mrow" key={y}>
          {row.map((v, x) => <div key={x} className={'mcell' + (v ? ' on' : '')} style={v ? { background: COLORS[k] } : {}} />)}
        </div>
      ))}
    </div>
  );
}

/* ══════════ 터치 아이콘 ══════════ */
const Ico = {
  left:  <svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.4"/></svg>,
  right: <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4"/></svg>,
  soft:  <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4"/></svg>,
  hard:  <svg viewBox="0 0 24 24"><path d="M6 3l6 6 6-6M6 10l6 6 6-6M5 21h14" fill="none" stroke="currentColor" strokeWidth="2.2"/></svg>,
  spin:  <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M18 3v4h-4" fill="none" stroke="currentColor" strokeWidth="2.2"/></svg>,
};

/* ══════════ App ══════════ */
function App() {
  const gRef = useRef<G>(initGame());
  const [, render] = useReducer((x: number) => x + 1, 0);
  const [muted, setMuted] = useState(false);
  const rep = useRef<{ t?: number; i?: number }>({});
  const sid = useRef(0);

  /* ── 스탬프 표시 ── */
  const showStamp = (text: string, sub?: string, big = false) => {
    const g = gRef.current, id = ++sid.current;
    g.stamp = { text, sub, big, id };
    setTimeout(() => {
      if (gRef.current.stamp?.id === id) { gRef.current.stamp = null; render(); }
    }, big ? 1400 : 1000);
  };

  /* ── 스폰 ── */
  const spawn = () => {
    const g = gRef.current;
    while (g.queue.length < 5) g.queue.push(drawKey());
    const p = makePiece(g.queue.shift()!);
    g.piece = p; g.canHold = true; g.groundedMs = 0;
    if (collides(p.matrix, p.x, p.y, g.board)) { g.phase = 'over'; Sfx.over(); }
  };

  /* ── 락 & 라인 클리어 ── */
  const lockPiece = () => {
    const g = gRef.current, p = g.piece!;
    p.matrix.forEach((row, dy) => row.forEach((v, dx) => {
      if (!v) return;
      const ny = p.y + dy, nx = p.x + dx;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) g.board[ny][nx] = p.key;
    }));
    g.piece = null; Sfx.lock();

    const full: number[] = [];
    g.board.forEach((row, y) => { if (row.every(c => c)) full.push(y); });

    if (full.length) {
      g.phase = 'clearing'; g.clearingRows = full;
      g.lines += full.length;
      const gained = CLEAR_PTS[full.length] * g.level;
      g.score += gained;
      showStamp(CLEAR_NAME[full.length], `+${gained}`, full.length === 4);
      Sfx.clear(full.length);
      const nl = Math.floor(g.lines / 10) + 1;
      if (nl > g.level) setTimeout(() => { g.level = nl; showStamp('LEVEL ' + nl, '속도 상승'); Sfx.levelup(); render(); }, 700);
      setTimeout(() => {
        g.board = g.board.filter((_, y) => !full.includes(y));
        while (g.board.length < ROWS) g.board.unshift(Array<CellVal>(COLS).fill(0));
        g.clearingRows = []; spawn();
        if (g.phase !== 'over') g.phase = 'playing';
        render();
      }, 260);
    } else {
      spawn();
    }
    render();
  };

  /* ── 액션들 ── */
  const move = (dx: number) => {
    const g = gRef.current;
    if (g.phase !== 'playing' || !g.piece || collides(g.piece.matrix, g.piece.x + dx, g.piece.y, g.board)) return;
    g.piece.x += dx; g.groundedMs = 0; Sfx.move(); render();
  };
  const spin = (dir: number) => {
    const g = gRef.current;
    if (g.phase !== 'playing' || !g.piece || g.piece.key === 'O') return;
    const p = g.piece, m = dir > 0 ? rotCW(p.matrix) : rotCCW(p.matrix);
    for (const [dx, dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,1]]) {
      if (!collides(m, p.x + dx, p.y + dy, g.board)) {
        p.matrix = m; p.x += dx; p.y += dy; g.groundedMs = 0; Sfx.rotate(); render();
        return;
      }
    }
  };
  const softStep = () => {
    const g = gRef.current;
    if (g.phase !== 'playing' || !g.piece || collides(g.piece.matrix, g.piece.x, g.piece.y + 1, g.board)) return;
    g.piece.y++; g.score++; render();
  };
  const hardDrop = () => {
    const g = gRef.current;
    if (g.phase !== 'playing' || !g.piece) return;
    let d = 0;
    while (!collides(g.piece.matrix, g.piece.x, g.piece.y + 1, g.board)) { g.piece.y++; d++; }
    if (d) { g.score += d * 2; Sfx.drop(); }
    lockPiece();
  };
  const doHold = () => {
    const g = gRef.current;
    if (g.phase !== 'playing' || !g.piece || !g.canHold) return;
    const cur = g.piece.key;
    if (g.hold) {
      const prev = g.hold; g.hold = cur; g.piece = makePiece(prev);
      if (collides(g.piece.matrix, g.piece.x, g.piece.y, g.board)) { g.phase = 'over'; Sfx.over(); }
    } else { g.hold = cur; spawn(); }
    g.canHold = false; Sfx.rotate(); render();
  };
  const togglePause = () => {
    const g = gRef.current;
    if (g.phase === 'playing') { g.phase = 'paused'; stopRepeat(); }
    else if (g.phase === 'paused') g.phase = 'playing';
    else return;
    render();
  };
  const start = () => {
    bag = [];
    gRef.current = initGame();
    spawn();
    gRef.current.phase = 'playing';
    Sfx.ensure(); stopRepeat(); render();
    (document.activeElement as HTMLElement)?.blur?.();
  };

  /* ── 반복 입력 (DAS/ARR) ── */
  const startRepeat = (fn: () => void) => {
    stopRepeat(); fn();
    rep.current.t = window.setTimeout(() => { rep.current.i = window.setInterval(fn, 45); }, 160);
  };
  const stopRepeat = () => {
    clearTimeout(rep.current.t); clearInterval(rep.current.i);
    rep.current = {};
  };

  /* ── 키보드 ── */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      Sfx.ensure();
      const g = gRef.current;
      if (e.key === 'Enter') { if (g.phase === 'ready' || g.phase === 'over') start(); return; }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return; }
      if (e.key === 'm' || e.key === 'M') { setMuted(Sfx.toggle()); return; }
      if (g.phase !== 'playing') return;
      switch (e.key) {
        case 'ArrowLeft':  startRepeat(() => move(-1)); break;
        case 'ArrowRight': startRepeat(() => move(1));  break;
        case 'ArrowDown':  startRepeat(softStep); break;
        case 'ArrowUp': case 'x': case 'X': spin(1);  break;
        case 'z': case 'Z':                   spin(-1); break;
        case ' ':                             hardDrop(); break;
        case 'c': case 'C': case 'Shift':     doHold(); break;
      }
    };
    const ku = (e: KeyboardEvent) => { if (['ArrowLeft','ArrowRight','ArrowDown'].includes(e.key)) stopRepeat(); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  /* ── 게임 루프 (rAF 기반, 중력 + 락 딜레이) ── */
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, t - last); last = t;
      const g = gRef.current;
      if (g.phase !== 'playing' || !g.piece) { acc = 0; return; }
      if (collides(g.piece.matrix, g.piece.x, g.piece.y + 1, g.board)) {
        g.groundedMs += dt;                    // 바닥에 닿아 420ms 지나면 락
        if (g.groundedMs >= 420) { lockPiece(); acc = 0; return; }
      } else g.groundedMs = 0;
      acc += dt;
      const iv = Math.max(60, 780 * Math.pow(0.82, g.level - 1));
      while (acc >= iv) {
        acc -= iv;
        if (g.piece && !collides(g.piece.matrix, g.piece.x, g.piece.y + 1, g.board)) g.piece.y++;
        else break;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); stopRepeat(); };
  }, []);

  /* ── 렌더용 표시 보드 구성 ── */
  const g = gRef.current;
  const disp: (CellVal | Ghost)[][] = g.board.map(r => [...r]);
  if (g.piece && g.phase !== 'over') {
    const p = g.piece;
    let gy = p.y;
    while (!collides(p.matrix, p.x, gy + 1, g.board)) gy++;
    p.matrix.forEach((row, dy) => row.forEach((v, dx) => {
      if (v && gy + dy >= 0 && gy + dy < ROWS) disp[gy + dy][p.x + dx] = 'G';
    }));
    p.matrix.forEach((row, dy) => row.forEach((v, dx) => {
      if (v && p.y + dy >= 0 && p.y + dy < ROWS) disp[p.y + dy][p.x + dx] = p.key;
    }));
  }

  const touchBtn = (label: string, icon: any, down: () => void, up?: () => void) => (
    <button aria-label={label}
      onPointerDown={(e: any) => { e.preventDefault(); Sfx.ensure(); down(); }}
      onPointerUp={() => up?.()} onPointerLeave={() => up?.()}>
      {icon}
    </button>
  );

  return (
    <div className="page">
      <header>
        <div className="masthead-rule">
          <span>잉크 아케이드 주간</span>
          <span className="mid">제 7 호 — 낙하하는 것들에 관하여</span>
          <span>단판 승부</span>
        </div>
        <div className="masthead">
          <h1>TETRIS<span className="dot">.</span></h1>
          <svg className="roundstamp" viewBox="0 0 100 100">
            <defs><path id="cir" d="M50,50 m-35,0 a35,35 0 1,1 70,0 a35,35 0 1,1 -70,0"/></defs>
            <circle cx="50" cy="50" r="47" fill="none" stroke="var(--verm)" strokeWidth="3"/>
            <circle cx="50" cy="50" r="25" fill="none" stroke="var(--verm)" strokeWidth="1.5"/>
            <text fontFamily="'IBM Plex Mono'" fontSize="10.5" letterSpacing="2.6" fill="var(--verm)">
              <textPath href="#cir">INK ARCADE · EST.1984 · SEOUL ·</textPath>
            </text>
            <text x="50" y="55" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--verm)">落下</text>
          </svg>
          <button className={'sound' + (muted ? ' off' : '')} onClick={() => setMuted(Sfx.toggle())}>
            {muted ? 'SOUND OFF' : 'SOUND ON'}
          </button>
        </div>
        <p className="deck">일곱 개의 조각, 한 장의 종이 — 잉크가 마르기 전에 줄을 지워라.</p>
      </header>

      <main className="layout">
        {/* 좌측: 홀드 · 조작 */}
        <aside className="side left">
          <div className="panel">
            <div className="label">HOLD</div>
            <Mini k={g.hold} dim={!g.canHold}/>
          </div>
          <div className="panel keys-panel">
            <div className="label">조작</div>
            <ul className="keys">
              <li><span>이동</span><span className="kk">← →</span></li>
              <li><span>소프트 드롭</span><span className="kk">↓</span></li>
              <li><span>회전 / 반대회전</span><span className="kk">↑ X / Z</span></li>
              <li><span>즉시 낙하</span><span className="kk">SPACE</span></li>
              <li><span>홀드</span><span className="kk">C</span></li>
              <li><span>일시정지</span><span className="kk">P</span></li>
            </ul>
          </div>
        </aside>

        {/* 중앙: 보드 */}
        <section className="board-wrap">
          <div className="board">
            {disp.map((row, y) => (
              <div key={y} className={'brow' + (g.clearingRows.includes(y) ? ' clearing' : '')}>
                {row.map((v, x) =>
                  v === 'G' ? <div key={x} className="cell ghost"/>
                  : v       ? <div key={x} className="cell filled" style={{ background: COLORS[v] }}/>
                  : <div key={x} className="cell"/>
                )}
              </div>
            ))}
          </div>

          {g.stamp && (
            <div key={g.stamp.id} className={'stamp' + (g.stamp.big ? ' big' : '')}>
              {g.stamp.text}{g.stamp.sub && <span>{g.stamp.sub}</span>}
            </div>
          )}

          {g.phase === 'ready' && (
            <div className="overlay">
              <div className="ov-title">READY</div>
              <div className="swatches">{PIECES.map(k => <i key={k} style={{ background: COLORS[k] }}/>)}</div>
              <p>잉크를 적실 준비가 되었는가.</p>
              <button className="btn" onClick={start}>판을 시작한다</button>
              <span className="hint">또는 ENTER</span>
            </div>
          )}
          {g.phase === 'paused' && (
            <div className="overlay">
              <div className="ov-title">PAUSED</div>
              <button className="btn" onClick={togglePause}>계속</button>
              <span className="hint">P</span>
            </div>
          )}
          {g.phase === 'over' && (
            <div className="overlay">
              <div className="ov-title dead">GAME OVER</div>
              <p className="final">최종 점수 <b>{pad(g.score)}</b></p>
              <p>당신의 잉크는 여기까지 닳았다.</p>
              <button className="btn" onClick={start}>다시 찍는다</button>
              <span className="hint">또는 ENTER</span>
            </div>
          )}
        </section>

        {/* 우측: 점수 · 넥스트 */}
        <aside className="side right">
          <div className="panel">
            <div className="label">SCORE</div>
            <div className="value">{pad(g.score)}</div>
          </div>
          <div className="panel duet">
            <div><div className="label">LEVEL</div><div className="value sm">{g.level}</div></div>
            <div><div className="label">LINES</div><div className="value sm">{g.lines}</div></div>
          </div>
          <div className="panel">
            <div className="label">NEXT</div>
            <div className="nexts">{g.queue.slice(0, 3).map((k, i) => <Mini key={i} k={k}/>)}</div>
          </div>
        </aside>
      </main>

      {/* 터치 컨트롤 (모바일) */}
      <div className="touch">
        {touchBtn('hold', 'H', () => doHold())}
        {touchBtn('left', Ico.left, () => startRepeat(() => move(-1)), stopRepeat)}
        {touchBtn('soft', Ico.soft, () => startRepeat(softStep), stopRepeat)}
        {touchBtn('right', Ico.right, () => startRepeat(() => move(1)), stopRepeat)}
        {touchBtn('rotate', Ico.spin, () => spin(1))}
        {touchBtn('hard drop', Ico.hard, () => hardDrop())}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
</script>
</body>
</html>
```

## 구현 설명

**게임 로직 (완전한 테트리스)**
- **7-bag 랜덤라이저** — 7종 조각이 한 세트로 골고루 등장
- **월 킥 회전** — 회전 후 벽/바닥에 걸리면 9개 오프셋을 순차 시도
- **락 딜레이 420ms** — 바닥에 닿아도 즉시 고정되지 않아 마지막 순간 미끄러뜨리기 가능
- **고스트 피스**(해칭 패턴 점선), **홀드**, **NEXT 3개 큐**, 소프트드롭 +1/칸, 하드드롭 +2/칸, 1~4줄 100/300/500/800 × 레벨 점수, 10줄마다 레벨업(중력 가속)
- **조작감**: `e.repeat`를 무시하고 자체 DAS(160ms 지연)/ARR(45ms) 반복을 구현해 키를 누르고 있으면 부드럽게 슬라이드됩니다. `requestAnimationFrame` 기반 루프라 프레임 드랍에서도 중력이 정확합니다.

**디자인 — "잉크 아케이드"**
- 크림 종이 배경에 SVG 노이즈 질감, 7색 제한된 잉크 팔레트, 신문 마스트헤드 형식의 헤더와 회전하는 원형 도장, `mix-blend-mode: multiply`로 종이에 실제로 찍힌 듯한 스탬프
- **시그니처 모먼트**: 라인 클리어 시 해당 행이 잉크 반전으로 깜빡 사라지고, `SINGLE/TETRIS` 도장이 회전하며 쾅 찍힙니다. 4줄 클리어는 잉크를 채운 대형 스탬프로
- Web Audio로 이동/회전/클리어/레벨업 효과음을 직접 합성했고(M키 음소거), 모바일에선 터치 컨트롤 버튼이 나타납니다

파일을 브라우저에서 열기만 하면 바로 플레이할 수 있습니다.