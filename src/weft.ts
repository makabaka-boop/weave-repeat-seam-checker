/**
 * 织机准备阶段·送纬器配台核心逻辑（纯函数，无 DOM 依赖）。
 *
 * 规则：
 * - 唯一颜色按色值首次出现的行列顺序（先行后列）提取，记录首个使用坐标与格数；
 * - 送纬器编号 1..8，同一送纬器不能承载两种颜色；
 * - 纹样存在空格、非法颜色或颜色数超过送纬器数量时，配台整体阻断并说明原因；
 * - 所有颜色均已分配且无占用冲突，才生成按送纬器号排序的上机顺序；
 * - 草稿引用了当前纹样中不存在的颜色即视为失效（编辑色格或应用新尺寸后）。
 */

import { Coords, Grid, HexColor, validateGrid } from './seams';

/** 送纬器数量：编号 1..WEFT_FEEDER_COUNT。 */
export const WEFT_FEEDER_COUNT = 8;

export const FEEDER_NUMBERS: readonly number[] = Array.from(
  { length: WEFT_FEEDER_COUNT },
  (_, i) => i + 1,
);

/** 一种唯一颜色：色值、首个使用坐标（0 基）、在纹样中的格数。 */
export interface ColorEntry {
  color: HexColor;
  first: Coords;
  count: number;
}

/** 配台阻断原因：空格 / 非法颜色 / 颜色数超过送纬器上限。 */
export type WeftBlocker =
  | { kind: 'empty'; empties: number }
  | { kind: 'invalid'; invalid: number }
  | { kind: 'too-many'; total: number };

/** 配台草稿：色值 -> 送纬器号（1..8）。 */
export type WeftDraft = Readonly<Record<HexColor, number>>;

/** 一条占用冲突：同一送纬器被两种及以上颜色占用。 */
export interface FeederConflict {
  feeder: number;
  /** 占用该送纬器的颜色，按首次出现顺序排列。 */
  colors: HexColor[];
}

/** 配台单一行：某送纬器承载的颜色及其格数。 */
export interface WeftPlanRow {
  feeder: number;
  color: HexColor;
  count: number;
}

/**
 * 按色值首次出现的行列顺序提取唯一颜色。
 * 空格跳过；提取顺序即 Map 插入顺序，与“先行后列”扫描一致。
 */
export function extractColors(grid: Grid): ColorEntry[] {
  const entries = new Map<HexColor, ColorEntry>();
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      const cell = grid[row][col];
      if (cell === null) continue;
      const entry = entries.get(cell);
      if (entry) {
        entry.count += 1;
      } else {
        entries.set(cell, { color: cell, first: { row, col }, count: 1 });
      }
    }
  }
  return [...entries.values()];
}

/**
 * 配台阻断原因；可配台时返回 null。
 * 空格优先报告（此时颜色统计无意义），其次非法颜色，最后才是颜色超上限。
 */
export function weftBlocker(grid: Grid): WeftBlocker | null {
  const { issues } = validateGrid(grid);
  const empties = issues.filter((issue) => issue.kind === 'empty').length;
  if (empties > 0) return { kind: 'empty', empties };
  const invalid = issues.filter((issue) => issue.kind === 'invalid').length;
  if (invalid > 0) return { kind: 'invalid', invalid };
  const total = extractColors(grid).length;
  if (total > WEFT_FEEDER_COUNT) return { kind: 'too-many', total };
  return null;
}

/** 送纬器号是否合法（1..8 的整数）；非法号一律按未分配处理。 */
export function isFeederNumber(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= WEFT_FEEDER_COUNT
  );
}

/** 占用冲突：同一送纬器被两种及以上颜色占用，按送纬器号排序返回。 */
export function findFeederConflicts(entries: ColorEntry[], draft: WeftDraft): FeederConflict[] {
  const byFeeder = new Map<number, HexColor[]>();
  for (const entry of entries) {
    const feeder = draft[entry.color];
    if (!isFeederNumber(feeder)) continue;
    const colors = byFeeder.get(feeder);
    if (colors) {
      colors.push(entry.color);
    } else {
      byFeeder.set(feeder, [entry.color]);
    }
  }
  return [...byFeeder.entries()]
    .filter(([, colors]) => colors.length > 1)
    .map(([feeder, colors]) => ({ feeder, colors }))
    .sort((a, b) => a.feeder - b.feeder);
}

/** 尚未分配（或分配了非法送纬器号）的颜色，按首次出现顺序返回。 */
export function unassignedColors(entries: ColorEntry[], draft: WeftDraft): HexColor[] {
  return entries.filter((entry) => !isFeederNumber(draft[entry.color])).map((entry) => entry.color);
}

/**
 * 生成配台单：所有颜色均已分配且无占用冲突时，
 * 返回按送纬器号排序的上机顺序（含各色格数量）；否则返回 null。
 * 草稿中引用当前纹样不存在的颜色不影响结果（调用方应已清理失效草稿）。
 */
export function buildWeftPlan(entries: ColorEntry[], draft: WeftDraft): WeftPlanRow[] | null {
  if (entries.length === 0) return null;
  if (unassignedColors(entries, draft).length > 0) return null;
  if (findFeederConflicts(entries, draft).length > 0) return null;
  return entries
    .map((entry) => ({ feeder: draft[entry.color], color: entry.color, count: entry.count }))
    .sort((a, b) => a.feeder - b.feeder);
}

/**
 * 草稿是否已失效：草稿引用了当前纹样中不存在的颜色。
 * 修改任一色格或应用新尺寸后颜色集合可能变化，调用方据此清空草稿与配台单。
 */
export function isDraftStale(entries: ColorEntry[], draft: WeftDraft): boolean {
  const present = new Set(entries.map((entry) => entry.color));
  return Object.keys(draft).some((color) => !present.has(color));
}
