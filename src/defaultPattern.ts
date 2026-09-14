import { Grid, normalizeHex } from './seams';

/**
 * 默认载入的 5×5 菱形纹样：左右首末列、上下首末行分别相等，
 * 两个方向都可连续铺展，作为工作台初始示例。
 */
const RAW_DEFAULT: string[][] = [
  ['E8E8E8', 'E8E8E8', '4A90D9', 'E8E8E8', 'E8E8E8'],
  ['E8E8E8', '4A90D9', '2C5F8A', '4A90D9', 'E8E8E8'],
  ['4A90D9', '2C5F8A', '1B3A5C', '2C5F8A', '4A90D9'],
  ['E8E8E8', '4A90D9', '2C5F8A', '4A90D9', 'E8E8E8'],
  ['E8E8E8', 'E8E8E8', '4A90D9', 'E8E8E8', 'E8E8E8'],
];

export const DEFAULT_GRID: Grid = RAW_DEFAULT.map((line) =>
  line.map((value) => normalizeHex(value)),
);
