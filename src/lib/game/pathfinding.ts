// 더블클릭 이동용 A* 경로 탐색 (4방향).
export interface PathNode {
  x: number;
  y: number;
}

export function findPath(
  grid: boolean[][], // true = 통과 불가
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = 6000
): PathNode[] | null {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (ty < 0 || ty >= rows || tx < 0 || tx >= cols) return null;
  if (grid[ty][tx]) {
    // 목적지가 막혀 있으면 주변 통과 가능한 칸으로 보정
    const near = [
      [tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty],
    ].find(([c, r]) => r >= 0 && r < rows && c >= 0 && c < cols && !grid[r][c]);
    if (!near) return null;
    tx = near[0];
    ty = near[1];
  }
  if (sx === tx && sy === ty) return [];

  const key = (x: number, y: number) => y * cols + x;
  const open: number[] = [key(sx, sy)];
  const gScore = new Map<number, number>([[key(sx, sy), 0]]);
  const fScore = new Map<number, number>([[key(sx, sy), Math.abs(tx - sx) + Math.abs(ty - sy)]]);
  const from = new Map<number, number>();
  const closed = new Set<number>();
  let visited = 0;

  while (open.length) {
    if (++visited > maxNodes) return null;
    // 가장 낮은 f 선택 (작은 맵이라 선형 탐색으로 충분)
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bi]) ?? Infinity)) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    if (cx === tx && cy === ty) {
      const path: PathNode[] = [{ x: cx, y: cy }];
      let k = cur;
      while (from.has(k)) {
        k = from.get(k)!;
        const px = k % cols;
        const py = Math.floor(k / cols);
        if (!(px === sx && py === sy)) path.unshift({ x: px, y: py });
      }
      return path;
    }
    closed.add(cur);
    const g = gScore.get(cur) ?? Infinity;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
      if (grid[ny][nx]) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        from.set(nk, cur);
        gScore.set(nk, ng);
        fScore.set(nk, ng + Math.abs(tx - nx) + Math.abs(ty - ny));
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return null;
}
