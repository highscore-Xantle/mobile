/**
 * Draughts / Checkers rules engine (ported from love-meet).
 *
 * Movement rules:
 *   • Pawns MOVE one diagonal step FORWARD only (red ↓, black ↑).
 *   • Pawns CAPTURE by jumping one square in ANY diagonal direction.
 *   • Kings MOVE any number of empty squares along a diagonal ("flying king").
 *   • Kings CAPTURE by flying along a diagonal, jumping a single opposing
 *     piece, and landing on any empty square beyond it.
 *   • Captures are FORCED — if any capture is available, you must take one.
 *   • Multi-jump chains are FORCED — keep jumping until you can't.
 *   • A pawn becomes a king the moment it lands on the opposite back rank.
 */

export type PieceColor = 'r' | 'b';
export type Piece = {
  id: number;
  r: number;
  c: number;
  color: PieceColor;
  king: boolean;
};
export type Board = Piece[];
export type Square = { r: number; c: number };

export type Move = {
  from: Square;
  to: Square;
  captures: Square[];
};

export const BOARD_SIZE = 8;

export function initialBoard(): Board {
  const out: Board = [];
  let id = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) out.push({ id: id++, r, c, color: 'r', king: false });
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) out.push({ id: id++, r, c, color: 'b', king: false });
    }
  }
  return out;
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

const FORWARD_DR: Record<PieceColor, 1 | -1> = { r: 1, b: -1 };
const DIAGS: Array<[1 | -1, 1 | -1]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function indexBoard(board: Board): Map<string, Piece> {
  const m = new Map<string, Piece>();
  for (const p of board) m.set(`${p.r},${p.c}`, p);
  return m;
}

/** Plain (non-capture) moves. Pawns: one diagonal step forward only.
 *  Kings: slide any distance along a diagonal until blocked. */
function plainStepsFrom(piece: Piece, idx: Map<string, Piece>): Move[] {
  const moves: Move[] = [];
  if (piece.king) {
    for (const [dr, dc] of DIAGS) {
      let r = piece.r + dr, c = piece.c + dc;
      while (inBounds(r, c) && !idx.has(`${r},${c}`)) {
        moves.push({ from: { r: piece.r, c: piece.c }, to: { r, c }, captures: [] });
        r += dr; c += dc;
      }
    }
  } else {
    const dr = FORWARD_DR[piece.color];
    for (const dc of [-1, 1] as const) {
      const nr = piece.r + dr, nc = piece.c + dc;
      if (inBounds(nr, nc) && !idx.has(`${nr},${nc}`)) {
        moves.push({ from: { r: piece.r, c: piece.c }, to: { r: nr, c: nc }, captures: [] });
      }
    }
  }
  return moves;
}

/** Pawn captures — 2-square jump in any diagonal direction. Walks recursively
 *  to find multi-jump chains; only TERMINAL chains are returned. */
function pawnCapturesFrom(piece: Piece, board: Board): Move[] {
  const idx = indexBoard(board);
  const out: Move[] = [];
  function walk(curR: number, curC: number, captured: string[], path: Square[]) {
    let extended = false;
    for (const [dr, dc] of DIAGS) {
      const midR = curR + dr, midC = curC + dc;
      const dstR = curR + 2 * dr, dstC = curC + 2 * dc;
      if (!inBounds(dstR, dstC)) continue;
      if (idx.has(`${dstR},${dstC}`) && !(dstR === piece.r && dstC === piece.c)) continue;
      const midKey = `${midR},${midC}`;
      if (captured.includes(midKey)) continue;
      const midOcc = idx.get(midKey);
      if (!midOcc || midOcc.color === piece.color) continue;
      extended = true;
      walk(dstR, dstC, [...captured, midKey], [...path, { r: dstR, c: dstC }]);
    }
    if (!extended && path.length > 1) {
      out.push({
        from: { r: piece.r, c: piece.c },
        to: path[path.length - 1],
        captures: captured.map((k) => {
          const [r, c] = k.split(',').map(Number); return { r, c };
        }),
      });
    }
  }
  walk(piece.r, piece.c, [], [{ r: piece.r, c: piece.c }]);
  return out;
}

/** King ("flying") captures. Along each diagonal, find the first opposing
 *  piece with empty squares in front, jump it, and land on any empty square
 *  beyond. Recurse from each candidate landing. */
function kingCapturesFrom(piece: Piece, board: Board): Move[] {
  const idx = indexBoard(board);
  const out: Move[] = [];
  function walk(curR: number, curC: number, captured: string[], path: Square[]) {
    let extended = false;
    for (const [dr, dc] of DIAGS) {
      let r = curR + dr, c = curC + dc;
      let oppKey: string | null = null;
      while (inBounds(r, c)) {
        const key = `${r},${c}`;
        const occ = idx.get(key);
        const occRemoved = !!occ && captured.includes(key);
        const occBlocking = !!occ && !occRemoved;
        const isStartSquare = r === piece.r && c === piece.c;
        if (occBlocking) {
          if (occ.color === piece.color) break;       // own piece blocks
          if (oppKey) break;                           // two opponents in a row → blocked
          oppKey = key;
        } else if (isStartSquare || !occBlocking) {
          if (oppKey) {
            extended = true;
            walk(r, c, [...captured, oppKey], [...path, { r, c }]);
          }
        }
        r += dr; c += dc;
      }
    }
    if (!extended && path.length > 1) {
      out.push({
        from: { r: piece.r, c: piece.c },
        to: path[path.length - 1],
        captures: captured.map((k) => {
          const [r, c] = k.split(',').map(Number); return { r, c };
        }),
      });
    }
  }
  walk(piece.r, piece.c, [], [{ r: piece.r, c: piece.c }]);
  return out;
}

function capturesFrom(piece: Piece, board: Board): Move[] {
  return piece.king ? kingCapturesFrom(piece, board) : pawnCapturesFrom(piece, board);
}

/** All legal moves for a side. Captures are forced — if any exist, plain
 *  steps are excluded entirely. */
export function legalMoves(board: Board, color: PieceColor): Move[] {
  const idx = indexBoard(board);
  const myPieces = board.filter((p) => p.color === color);
  const allCaptures = myPieces.flatMap((p) => capturesFrom(p, board));
  if (allCaptures.length > 0) return allCaptures;
  return myPieces.flatMap((p) => plainStepsFrom(p, idx));
}

export function legalMovesFrom(board: Board, square: Square, color: PieceColor): Move[] {
  return legalMoves(board, color).filter(
    (m) => m.from.r === square.r && m.from.c === square.c,
  );
}

/** Apply a (legal) move and return the new board, preserving piece IDs and
 *  promoting to king when the destination is the opposite back rank. */
export function applyMove(board: Board, move: Move): Board {
  const removed = new Set([
    `${move.from.r},${move.from.c}`,
    ...move.captures.map((s) => `${s.r},${s.c}`),
  ]);
  const survivor = board.find((p) => p.r === move.from.r && p.c === move.from.c);
  if (!survivor) return board;
  const next = board.filter((p) => !removed.has(`${p.r},${p.c}`));
  const promoted =
    (survivor.color === 'r' && move.to.r === 7) ||
    (survivor.color === 'b' && move.to.r === 0);
  next.push({
    id: survivor.id,
    r: move.to.r,
    c: move.to.c,
    color: survivor.color,
    king: survivor.king || promoted,
  });
  return next;
}

export function isLost(board: Board, color: PieceColor): boolean {
  if (!board.some((p) => p.color === color)) return true;
  return legalMoves(board, color).length === 0;
}
