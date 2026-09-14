/**
 * 提花小样接缝判定核心逻辑（纯函数，无 DOM 依赖）。
 *
 * 规则：
 * - 尺寸允许 2..24 行、2..24 列；
 * - 颜色一律规范为六位大写十六进制（如 0F1A2B）后按字符串比较；
 * - 水平方向可接：每一行的首列色格与末列色格颜色相等；
 * - 垂直方向可接：每一列的首行色格与末行色格颜色相等；
 * - 四个角格同时参与水平、垂直两组比较（双重归属）；
 * - 同一方向内一对不等只产生一条接缝，坐标按“先行后列”排序；
 * - 只要存在空格或非法颜色，整体不产生任何判定结论。
 */

export const MIN_SIZE = 2;
export const MAX_SIZE = 24;

export type HexColor = string;
/** 单元格内容：已规范的六位大写十六进制色值，或 null（空格）。 */
export type Cell = HexColor | null;
export type Grid = Cell[][];

export interface Coords {
  row: number;
  col: number;
}

export interface DimensionDraft {
  rowsInput: string;
  colsInput: string;
}

export interface DimensionErrors {
  rows?: string;
  cols?: string;
}

export interface GridIssue {
  kind: 'empty' | 'invalid';
  row: number;
  col: number;
}

/** 一条不匹配接缝：核心块两侧成对的两个色格。 */
export interface SeamMismatch {
  /** 行优先排序后的稳定编号，同方向内从 0 开始。 */
  index: number;
  axis: 'horizontal' | 'vertical';
  /** 接缝在核心块上的固定位置：行号（水平）或列号（垂直），0 基。 */
  position: number;
  /** 参与比较的两个端点，a 为先行后列排序中靠前的一格。 */
  a: Coords;
  b: Coords;
  colorA: HexColor;
  colorB: HexColor;
}

export interface SeamDirectionResult {
  axis: 'horizontal' | 'vertical';
  continuous: boolean;
  mismatches: SeamMismatch[];
}

export interface SeamResult {
  horizontal: SeamDirectionResult;
  vertical: SeamDirectionResult;
  bothContinuous: boolean;
}

/** 校验尺寸输入，返回字段级错误（无错误即表示可应用）。 */
export function validateDimensions(draft: DimensionDraft): DimensionErrors {
  const errors: DimensionErrors = {};
  const rows = Number(draft.rowsInput.trim());
  const cols = Number(draft.colsInput.trim());

  if (!/^\d+$/.test(draft.rowsInput.trim()) || !Number.isInteger(rows) || rows < MIN_SIZE || rows > MAX_SIZE) {
    errors.rows = `行数必须是 ${MIN_SIZE} 至 ${MAX_SIZE} 之间的整数`;
  }
  if (!/^\d+$/.test(draft.colsInput.trim()) || !Number.isInteger(cols) || cols < MIN_SIZE || cols > MAX_SIZE) {
    errors.cols = `列数必须是 ${MIN_SIZE} 至 ${MAX_SIZE} 之间的整数`;
  }
  return errors;
}

export function hasDimensionErrors(errors: DimensionErrors): boolean {
  return errors.rows !== undefined || errors.cols !== undefined;
}

export function createEmptyGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

/**
 * 把任意颜色输入规范为六位大写十六进制；非法输入返回 null。
 * 接受 #RRGGBB、RRGGBB（大小写均可）。三位简写与其它形式一律拒绝，
 * 以保证“按六位大写十六进制值比较”的口径唯一。
 */
export function normalizeHex(input: string): HexColor | null {
  const value = input.trim().replace(/^#/, '');
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) {
    return null;
  }
  return value.toUpperCase();
}

/** 逐格检查：空格与非法颜色都给字段级（逐格）错误。 */
export function validateGrid(grid: Grid): { issues: GridIssue[]; valid: boolean } {
  const issues: GridIssue[] = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      const cell = grid[row][col];
      if (cell === null) {
        issues.push({ kind: 'empty', row, col });
      } else if (!/^[0-9A-F]{6}$/.test(cell)) {
        issues.push({ kind: 'invalid', row, col });
      }
    }
  }
  return { issues, valid: issues.length === 0 };
}

/** 行优先比较两个坐标，用于排序。 */
export function compareCoords(x: Coords, y: Coords): number {
  if (x.row !== y.row) return x.row - y.row;
  return x.col - y.col;
}

/**
 * 执行接缝判定。
 * 调用方必须先通过 validateGrid / validateDimensions；
 * 这里保留防御式校验，任何前提不满足都直接抛出，绝不返回部分判定。
 */
export function analyzeSeams(grid: Grid): SeamResult {
  const rows = grid.length;
  if (rows < MIN_SIZE || rows > MAX_SIZE) {
    throw new Error(`行数越界：${rows}`);
  }
  const cols = grid[0]?.length ?? 0;
  if (cols < MIN_SIZE || cols > MAX_SIZE) {
    throw new Error(`列数越界：${cols}`);
  }
  const { valid } = validateGrid(grid);
  if (!valid) {
    throw new Error('存在空格或非法颜色，拒绝判定');
  }

  const horizontalPairs: SeamMismatch[] = [];
  for (let row = 0; row < rows; row += 1) {
    const left = { row, col: 0 };
    const right = { row, col: cols - 1 };
    const colorA = grid[row][0] as HexColor;
    const colorB = grid[row][cols - 1] as HexColor;
    if (colorA !== colorB) {
      horizontalPairs.push({
        index: 0,
        axis: 'horizontal',
        position: row,
        a: left,
        b: right,
        colorA,
        colorB,
      });
    }
  }

  const verticalPairs: SeamMismatch[] = [];
  for (let col = 0; col < cols; col += 1) {
    const top = { row: 0, col };
    const bottom = { row: rows - 1, col };
    const colorA = grid[0][col] as HexColor;
    const colorB = grid[rows - 1][col] as HexColor;
    if (colorA !== colorB) {
      verticalPairs.push({
        index: 0,
        axis: 'vertical',
        position: col,
        a: top,
        b: bottom,
        colorA,
        colorB,
      });
    }
  }

  // 行优先排序：水平接缝的 a 在首列、b 在末列；垂直接缝 a 首行、b 末行，
  // 各自自然递增，这里仍显式排序并重新编号，保证口径唯一。
  horizontalPairs
    .sort((p, q) => compareCoords(p.a, q.a) || compareCoords(p.b, q.b))
    .forEach((pair, index) => {
      pair.index = index;
    });
  verticalPairs
    .sort((p, q) => compareCoords(p.a, q.a) || compareCoords(p.b, q.b))
    .forEach((pair, index) => {
      pair.index = index;
    });

  const horizontal: SeamDirectionResult = {
    axis: 'horizontal',
    continuous: horizontalPairs.length === 0,
    mismatches: horizontalPairs,
  };
  const vertical: SeamDirectionResult = {
    axis: 'vertical',
    continuous: verticalPairs.length === 0,
    mismatches: verticalPairs,
  };

  return { horizontal, vertical, bothContinuous: horizontal.continuous && vertical.continuous };
}

/** 1 基人类可读坐标，如 “R3C1”。 */
export function formatCoords(coords: Coords): string {
  return `R${coords.row + 1}C${coords.col + 1}`;
}
