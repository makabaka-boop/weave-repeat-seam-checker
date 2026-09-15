import { useEffect, useRef } from 'react';
import { Coords, Grid, HexColor, SeamMismatch } from './seams';

interface SeamCanvasProps {
  grid: Grid;
  mismatches: SeamMismatch[];
  located: { axis: 'horizontal' | 'vertical'; position: number } | null;
  /** 色值 -> 送纬器号；仅在中央核心块画角标，不影响既有断纹标记。 */
  weftAssignments: ReadonlyMap<HexColor, number>;
}

/**
 * 三乘三循环铺展预览。
 * 中央为核心块，四周 8 块为复制结果；不匹配的接缝在核心块两侧
 * （首/末列或首/末行）成对加红色描边，并在跨块相邻处同步标出。
 * 已分配送纬器的颜色在核心块色格右上角叠加深色角标。
 */
export function SeamCanvas({ grid, mismatches, located, weftAssignments }: SeamCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows === 0 || cols === 0) return;

    const draw = () => {
      const cssSize = Math.max(canvas.clientWidth, 320);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);

      // 格子同时受画布宽、高约束（极端比例如 24 行 × 2 列也必须完整露出九块），
      // 再整体居中。
      const cell = Math.min(cssSize / (cols * 3), cssSize / (rows * 3));
      const contentW = cell * cols * 3;
      const contentH = cell * rows * 3;
      const offsetX = (cssSize - contentW) / 2;
      const offsetY = (cssSize - contentH) / 2;
      const originX = offsetX + cell * cols;
      const originY = offsetY + cell * rows;

      const cellRect = (tileX: number, tileY: number, r: number, c: number) => ({
        x: offsetX + (tileX * cols + c) * cell,
        y: offsetY + (tileY * rows + r) * cell,
        w: cell,
        h: cell,
      });

      // 1. 铺 3×3 复制块，空格画白。
      for (let tileY = 0; tileY < 3; tileY += 1) {
        for (let tileX = 0; tileX < 3; tileX += 1) {
          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const rect = cellRect(tileX, tileY, r, c);
              // 色值是六位大写十六进制（无 # 前缀），补前缀才是合法 CSS 颜色。
              ctx.fillStyle = grid[r][c] ? `#${grid[r][c]}` : '#FFFFFF';
              ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            }
          }
        }
      }

      // 2. 细网格线（仅在九块铺展区域内）。
      ctx.strokeStyle = '#C9CDD4';
      ctx.lineWidth = 1;
      for (let i = 0; i <= cols * 3; i += 1) {
        const x = offsetX + i * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + contentH);
        ctx.stroke();
      }
      for (let i = 0; i <= rows * 3; i += 1) {
        const y = offsetY + i * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + contentW, y);
        ctx.stroke();
      }

      // 3. 核心块粗边框。
      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(originX, originY, cols * cell, rows * cell);

      const drawOutline = (
        coords: Coords,
        tileX: number,
        tileY: number,
        color: string,
        width: number,
      ) => {
        const rect = cellRect(tileX, tileY, coords.row, coords.col);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
      };

      const drawBadge = (
        coords: Coords,
        tileX: number,
        tileY: number,
        label: string,
        strong: boolean,
      ) => {
        const rect = cellRect(tileX, tileY, coords.row, coords.col);
        // 直径不超过格内尺寸，避免在窄格（如 24×2）里溢出。
        const radius = Math.min(cell * 0.42, 12);
        const cx = rect.x + radius + 1;
        const cy = rect.y + radius + 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = strong ? '#B45309' : '#B91C1C';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.max(5, Math.round(radius * 1.1))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + 0.5);
      };

      // 4. 不匹配成对标记。
      // 核心块两个端点（红描边 + 编号）；
      // 跨块相邻一侧的复制块端点用淡红描边，直观显示连续铺展后的断纹。
      mismatches.forEach((pair) => {
        const isLocated =
          located !== null && located.axis === pair.axis && located.position === pair.position;
        const coreColor = isLocated ? '#F59E0B' : '#DC2626';
        const nearColor = isLocated ? 'rgba(245,158,11,0.55)' : 'rgba(220,38,38,0.45)';
        const width = isLocated ? 4 : 2.5;
        const label = String(pair.index + 1);

        if (pair.axis === 'horizontal') {
          // 首列（左）端点：核心块与左侧复制块的相邻处。
          drawOutline(pair.a, 1, 1, coreColor, width);
          drawOutline(pair.a, 0, 1, nearColor, width);
          // 末列（右）端点：核心块与右侧复制块的相邻处。
          drawOutline(pair.b, 1, 1, coreColor, width);
          drawOutline(pair.b, 2, 1, nearColor, width);
          drawBadge(pair.a, 1, 1, label, isLocated);
          drawBadge(pair.b, 1, 1, label, isLocated);
        } else {
          drawOutline(pair.a, 1, 1, coreColor, width);
          drawOutline(pair.a, 1, 0, nearColor, width);
          drawOutline(pair.b, 1, 1, coreColor, width);
          drawOutline(pair.b, 1, 2, nearColor, width);
          drawBadge(pair.a, 1, 1, label, isLocated);
          drawBadge(pair.b, 1, 1, label, isLocated);
        }
      });
      // 5. 送纬器角标：仅中央核心块，画在色格右上角，
      // 与断纹的红描边、编号（左上角）互不干扰。
      if (weftAssignments.size > 0) {
        const radius = Math.min(cell * 0.32, 10);
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const color = grid[r][c];
            if (color === null) continue;
            const feeder = weftAssignments.get(color);
            if (feeder === undefined) continue;
            const rect = cellRect(1, 1, r, c);
            const cx = rect.x + rect.w - radius - 1;
            const cy = rect.y + radius + 1;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#1F2937';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${Math.max(5, Math.round(radius * 1.1))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(feeder), cx, cy + 0.5);
          }
        }
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [grid, rows, cols, mismatches, located, weftAssignments]);

  return (
    <canvas
      ref={canvasRef}
      className="seam-canvas"
      data-testid="seam-canvas"
      role="img"
      aria-label="三乘三循环铺展预览，红框标出不匹配接缝的成对端点"
    />
  );
}
