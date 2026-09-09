export interface SagaShareSnapshot {
  url: string;
  title: string;
  page: string;
  location: string;
  fen: string;
  orientation: 'white' | 'black';
  activeSquare: string | null;
  selectedSquare: string | null;
  story: string;
  capture?: {
    victim: string;
    captor: string;
    symbol: string | null;
    square: string;
    enPassant: boolean;
  } | null;
  character: {
    name: string;
    role: string;
    description: string;
    status: string;
  } | null;
}

export function shareBoardSquares(fen: string, orientation: 'white' | 'black') {
  const pieces = new Map<string, string>();
  fen
    .split(' ')[0]
    .split('/')
    .forEach((rank, row) => {
      let file = 0;
      for (const value of rank) {
        if (/\d/.test(value)) file += Number(value);
        else pieces.set(`${'abcdefgh'[file++]}${8 - row}`, value);
      }
    });
  return Array.from({ length: 64 }, (_, index) => {
    const row = Math.floor(index / 8),
      col = index % 8;
    const file = orientation === 'white' ? col : 7 - col;
    const rank = orientation === 'white' ? 8 - row : row + 1;
    const square = `${'abcdefgh'[file]}${rank}`;
    return {
      row,
      col,
      square,
      piece: pieces.get(square) ?? null,
      light: (file + rank) % 2 === 0,
    };
  });
}

// Uses the same locally bundled SVG artwork as the replay board; no image API.
async function pieceArtwork(value: string): Promise<HTMLImageElement> {
  const roles: Record<string, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  const wrap = document.createElement('div');
  wrap.className = 'cg-wrap';
  wrap.style.cssText = 'position:fixed;left:-10000px;visibility:hidden';
  const piece = document.createElement('piece');
  piece.className = `${roles[value.toLowerCase()]} ${value === value.toUpperCase() ? 'white' : 'black'}`;
  wrap.append(piece);
  document.body.append(wrap);
  const background = getComputedStyle(piece).backgroundImage;
  wrap.remove();
  const source = background.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
  if (!source?.startsWith('data:image/svg+xml'))
    throw new Error('Piece artwork unavailable');
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Piece artwork unavailable'));
    image.src = source;
  });
}

export async function renderSagaShare(
  snapshot: SagaShareSnapshot,
): Promise<Blob> {
  const squares = shareBoardSquares(snapshot.fen, snapshot.orientation);
  const artwork = new Map(
    await Promise.all(
      [
        ...new Set([
          ...squares.flatMap((s) => (s.piece ? [s.piece] : [])),
          ...(snapshot.capture?.symbol ? [snapshot.capture.symbol] : []),
        ]),
      ].map(async (p) => [p, await pieceArtwork(p)] as const),
    ),
  );
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image rendering unavailable');
  const width = 1000,
    margin = 56,
    contentWidth = width - margin * 2;
  const blocks: { text: string; size: number; color: string }[] = [
    { text: snapshot.title, size: 34, color: '#ead396' },
    {
      text:
        snapshot.page + (snapshot.location ? ` · ${snapshot.location}` : ''),
      size: 24,
      color: '#79c9c0',
    },
  ];
  const wrap = (text: string, size: number) => {
    ctx.font = `${size}px Arial`;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && ctx.measureText(`${line} ${word}`).width > contentWidth) {
          lines.push(line);
          line = '';
        }
        // Split unusually long tokens instead of clipping shared text.
        for (const char of (line ? ' ' : '') + word) {
          if (ctx.measureText(line + char).width > contentWidth) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const header = blocks.map((b) => ({ ...b, lines: wrap(b.text, b.size) }));
  const bottom = [
    ...(snapshot.capture
      ? [
          { text: snapshot.capture.victim, size: 30, color: '#f0a494' },
          {
            text: `Taken by ${snapshot.capture.captor}`,
            size: 26,
            color: '#e8e4d8',
          },
          {
            text: `Removed from ${snapshot.capture.square}${snapshot.capture.enPassant ? ' (en passant)' : ''}. The board shows the position after the capture.`,
            size: 22,
            color: '#a8b1bb',
          },
        ]
      : []),
    ...(snapshot.character
      ? [
          {
            text: `${snapshot.character.name} · ${snapshot.character.role}`,
            size: 30,
            color: '#ead396',
          },
          {
            text: `Status at this beat: ${snapshot.character.status}`,
            size: 24,
            color: '#79c9c0',
          },
          { text: snapshot.character.description, size: 26, color: '#e8e4d8' },
        ]
      : []),
    { text: snapshot.story, size: 28, color: '#e8e4d8' },
    {
      text: 'Chess Sagas · AI-generated story · Open the replay link to continue',
      size: 20,
      color: '#a8b1bb',
    },
  ].map((b) => ({ ...b, lines: wrap(b.text, b.size) }));
  const heightOf = (b: (typeof header)[number]) =>
    b.lines.length * b.size * 1.45 + 24;
  const height = Math.ceil(
    margin * 2 +
      header.reduce((s, b) => s + heightOf(b), 0) +
      contentWidth +
      40 +
      (snapshot.capture ? 104 : 0) +
      bottom.reduce((s, b) => s + heightOf(b), 0),
  );
  if (height > 16000)
    throw new Error(
      'This page is too long for one image. Use Copy replay link instead.',
    );
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = '#0b1520';
  ctx.fillRect(0, 0, width, height);
  let y = margin;
  const drawText = (b: (typeof header)[number]) => {
    ctx.font = `${b.size}px Arial`;
    ctx.fillStyle = b.color;
    ctx.textBaseline = 'top';
    for (const line of b.lines) {
      ctx.fillText(line, margin, y);
      y += b.size * 1.45;
    }
    y += 24;
  };
  header.forEach(drawText);
  const side = contentWidth / 8;
  for (const s of squares) {
    const x = margin + s.col * side,
      top = y + s.row * side;
    ctx.fillStyle = s.light ? '#efdbb7' : '#b6a486';
    ctx.fillRect(x, top, side, side);
    if (s.square === snapshot.activeSquare) {
      ctx.fillStyle = '#e8c34788';
      ctx.fillRect(x, top, side, side);
    }
    if (s.piece)
      ctx.drawImage(
        artwork.get(s.piece)!,
        x + 6,
        top + 6,
        side - 12,
        side - 12,
      );
    if (s.square === snapshot.selectedSquare) {
      ctx.strokeStyle = '#148879';
      ctx.lineWidth = 7;
      ctx.strokeRect(x + 4, top + 4, side - 8, side - 8);
    }
  }
  y += contentWidth + 40;
  if (snapshot.capture) {
    // Display the missing piece separately, never as a ghost on the live board.
    ctx.fillStyle = '#d9c6a5';
    ctx.fillRect(margin, y, 80, 80);
    if (snapshot.capture.symbol) {
      ctx.drawImage(
        artwork.get(snapshot.capture.symbol)!,
        margin + 4,
        y + 4,
        72,
        72,
      );
    }
    ctx.font = '30px Arial';
    ctx.fillStyle = '#f0a494';
    ctx.textBaseline = 'top';
    ctx.fillText('Captured this beat', margin + 104, y + 24);
    y += 104;
  }
  bottom.forEach(drawText);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not create image')),
      'image/png',
    ),
  );
}
