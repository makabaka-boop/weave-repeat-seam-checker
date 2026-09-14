import { describe, expect, it } from 'vitest';
import {
  analyzeSeams,
  compareCoords,
  createEmptyGrid,
  formatCoords,
  hasDimensionErrors,
  normalizeHex,
  validateDimensions,
  validateGrid,
  Grid,
} from './seams';

const fill = (rows: number, cols: number, color = 'AABBCC'): Grid =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => color));

const gridFrom = (raw: string[][]): Grid => raw.map((line) => line.map((v) => normalizeHex(v)));

describe('analyzeSeams 双向通过', () => {
  it('所有色格同色时两个方向均可连续铺展', () => {
    const result = analyzeSeams(fill(3, 3));
    expect(result.horizontal.continuous).toBe(true);
    expect(result.vertical.continuous).toBe(true);
    expect(result.bothContinuous).toBe(true);
    expect(result.horizontal.mismatches).toHaveLength(0);
    expect(result.vertical.mismatches).toHaveLength(0);
  });

  it('首末列相等且首末行相等的菱形图案双向可接', () => {
    const grid = gridFrom([
      ['E8E8E8', 'E8E8E8', '4A90D9', 'E8E8E8', 'E8E8E8'],
      ['E8E8E8', '4A90D9', '2C5F8A', '4A90D9', 'E8E8E8'],
      ['4A90D9', '2C5F8A', '1B3A5C', '2C5F8A', '4A90D9'],
      ['E8E8E8', '4A90D9', '2C5F8A', '4A90D9', 'E8E8E8'],
      ['E8E8E8', 'E8E8E8', '4A90D9', 'E8E8E8', 'E8E8E8'],
    ]);
    const result = analyzeSeams(grid);
    expect(result.bothContinuous).toBe(true);
  });

  it('2×2 最小尺寸的角格比较正常完成', () => {
    const result = analyzeSeams(fill(2, 2, '000000'));
    expect(result.bothContinuous).toBe(true);
  });

  it('颜色按六位大写十六进制比较：小写输入规范后相等', () => {
    const grid = gridFrom([
      ['aabbcc', '000000', 'AAbbcc'.toUpperCase()],
      ['aabbcc', 'ffffff', 'AABBCC'],
    ]);
    const result = analyzeSeams(grid);
    // 每行首列 aabbcc 与末列 AABBCC 规范后相等
    expect(result.horizontal.continuous).toBe(true);
  });
});

describe('analyzeSeams 单向断纹', () => {
  it('仅水平方向断开：破坏一行的首末列，垂直仍可接', () => {
    const grid = fill(3, 4, '112233');
    grid[1][0] = 'FF0000'; // 只改第 2 行首列；同时破坏第 1 列的上下对齐吗？不影响首行/末行
    const result = analyzeSeams(grid);
    expect(result.horizontal.continuous).toBe(false);
    expect(result.vertical.continuous).toBe(true);
    expect(result.bothContinuous).toBe(false);
    expect(result.horizontal.mismatches).toHaveLength(1);
    const pair = result.horizontal.mismatches[0];
    expect(pair.position).toBe(1);
    expect(pair.a).toEqual({ row: 1, col: 0 });
    expect(pair.b).toEqual({ row: 1, col: 3 });
    expect(pair.colorA).toBe('FF0000');
    expect(pair.colorB).toBe('112233');
  });

  it('仅垂直方向断开：破坏一列的首末行，水平仍可接', () => {
    const grid = fill(4, 3, '445566');
    grid[0][2] = '00FF00'; // 只改首行末列
    grid[3][2] = '00FF00'; // 末行末列同步改成同色 -> 第 3 列上下相等，仍可接！
    const result = analyzeSeams(grid);
    expect(result.vertical.continuous).toBe(true);
    // 每行首列 445566 与末列（第 1 行末列变 00FF00）不等：水平断开
    expect(result.horizontal.continuous).toBe(false);

    const grid2 = fill(4, 3, '445566');
    grid2[0][1] = '00FF00'; // 只改首行中间列 -> 只影响垂直
    const result2 = analyzeSeams(grid2);
    expect(result2.horizontal.continuous).toBe(true);
    expect(result2.vertical.continuous).toBe(false);
    expect(result2.vertical.mismatches).toHaveLength(1);
    expect(result2.vertical.mismatches[0].position).toBe(1);
    expect(result2.vertical.mismatches[0].a).toEqual({ row: 0, col: 1 });
    expect(result2.vertical.mismatches[0].b).toEqual({ row: 3, col: 1 });
  });

  it('双向同时断开时两个方向各自独立列出接缝', () => {
    const grid = fill(3, 3, '778899');
    grid[0][0] = 'FF0000'; // 左上角：水平第 1 行 + 垂直第 1 列同时断开
    grid[2][1] = '0000FF'; // 末行中间：只断垂直第 2 列
    const result = analyzeSeams(grid);
    expect(result.horizontal.continuous).toBe(false);
    expect(result.vertical.continuous).toBe(false);
    expect(result.horizontal.mismatches).toHaveLength(1);
    expect(result.vertical.mismatches).toHaveLength(2);
  });
});

describe('角格双重归属', () => {
  it('2×2 角格颜色两两不同：四个角各同时参与一次水平与一次垂直比较', () => {
    const grid = gridFrom([
      ['FF0000', '00FF00'],
      ['0000FF', 'FFFFFF'],
    ]);
    const result = analyzeSeams(grid);
    // 水平：两行的首末列都不等 -> 2 条
    expect(result.horizontal.mismatches).toHaveLength(2);
    // 垂直：两列的首末行都不等 -> 2 条
    expect(result.vertical.mismatches).toHaveLength(2);

    const allCoords = [
      ...result.horizontal.mismatches.flatMap((p) => [p.a, p.b]),
      ...result.vertical.mismatches.flatMap((p) => [p.a, p.b]),
    ];
    // 每个角格必须恰好出现两次（水平一次、垂直一次）
    for (const coords of [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]) {
      const hits = allCoords.filter((c) => c.row === coords.row && c.col === coords.col);
      expect(hits).toHaveLength(2);
    }
  });

  it('单角改动同时产生水平与垂直接缝，且两条接缝引用同一个角坐标', () => {
    const grid = fill(3, 3, 'ABCDEF');
    grid[0][0] = '123456';
    const result = analyzeSeams(grid);
    const horizontal = result.horizontal.mismatches.find((p) => p.position === 0);
    const vertical = result.vertical.mismatches.find((p) => p.position === 0);
    expect(horizontal).toBeDefined();
    expect(vertical).toBeDefined();
    expect(horizontal!.a).toEqual({ row: 0, col: 0 });
    expect(vertical!.a).toEqual({ row: 0, col: 0 });
    // 另一对角（末行末列）不受影响
    expect(result.horizontal.mismatches.some((p) => p.position === 2)).toBe(false);
    expect(result.vertical.mismatches.some((p) => p.position === 2)).toBe(false);
  });
});

describe('排序与编号', () => {
  it('接缝按先行后列排序并重新编号', () => {
    const grid = fill(5, 5, 'C0C0C0');
    // 改首列（非角）破坏水平第 2、4 行；改首行中间列破坏垂直第 2、3 列，互不干扰
    grid[3][0] = 'FF0000';
    grid[1][0] = '00FF00';
    grid[0][1] = '0000FF';
    grid[0][2] = 'AAAA00';
    const result = analyzeSeams(grid);

    const hPositions = result.horizontal.mismatches.map((p) => p.position);
    expect(hPositions).toEqual([1, 3]);
    result.horizontal.mismatches.forEach((p, i) => expect(p.index).toBe(i));

    const vPositions = result.vertical.mismatches.map((p) => p.position);
    expect(vPositions).toEqual([1, 2]);
    result.vertical.mismatches.forEach((p, i) => expect(p.index).toBe(i));
  });

  it('compareCoords 严格按行再按列', () => {
    const coords = [
      { row: 2, col: 0 },
      { row: 0, col: 4 },
      { row: 0, col: 1 },
      { row: 1, col: 3 },
    ];
    coords.sort(compareCoords);
    expect(coords).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 4 },
      { row: 1, col: 3 },
      { row: 2, col: 0 },
    ]);
  });

  it('不匹配对的 a/b 端点按先行后列排布', () => {
    const grid = fill(2, 4, 'EEEEEE');
    grid[0][3] = '111111';
    const result = analyzeSeams(grid);
    const pair = result.horizontal.mismatches[0];
    expect(compareCoords(pair.a, pair.b)).toBeLessThan(0);
    expect(pair.a).toEqual({ row: 0, col: 0 });
    expect(pair.b).toEqual({ row: 0, col: 3 });
  });
});

describe('字段级错误与拒绝部分判定', () => {
  it('越界尺寸逐字段报错', () => {
    expect(hasDimensionErrors(validateDimensions({ rowsInput: '1', colsInput: '5' }))).toBe(true);
    expect(validateDimensions({ rowsInput: '1', colsInput: '5' }).rows).toBeTruthy();
    expect(validateDimensions({ rowsInput: '1', colsInput: '5' }).cols).toBeUndefined();
    expect(validateDimensions({ rowsInput: '25', colsInput: '0' })).toEqual({
      rows: expect.any(String),
      cols: expect.any(String),
    });
    expect(validateDimensions({ rowsInput: '2.5', colsInput: '3' }).rows).toBeTruthy();
    expect(validateDimensions({ rowsInput: 'abc', colsInput: '' }).rows).toBeTruthy();
    expect(hasDimensionErrors(validateDimensions({ rowsInput: '2', colsInput: '24' }))).toBe(false);
  });

  it('空格逐格报错', () => {
    const grid = createEmptyGrid(2, 2);
    grid[0][0] = 'ABCDEF';
    const { valid, issues } = validateGrid(grid);
    expect(valid).toBe(false);
    expect(issues).toHaveLength(3);
    expect(issues.every((i) => i.kind === 'empty')).toBe(true);
    expect(issues[0]).toEqual({ kind: 'empty', row: 0, col: 1 });
  });

  it('非法颜色只给字段级错误，且不产生任何接缝判定', () => {
    const grid = fill(2, 2, 'ABCDEF');
    grid[1][1] = '#GG0011' as never; // 防御：绕过类型检查注入非法值
    const { valid } = validateGrid(grid);
    expect(valid).toBe(false);
    expect(() => analyzeSeams(grid)).toThrow(/非法|空格/);
  });

  it('存在空格时 analyzeSeams 抛错而不是返回部分判定', () => {
    const grid = createEmptyGrid(2, 3);
    expect(() => analyzeSeams(grid)).toThrow();
  });

  it('尺寸越界时 analyzeSeams 抛错', () => {
    expect(() => analyzeSeams(createEmptyGrid(1, 3))).toThrow(/越界/);
    expect(() => analyzeSeams(createEmptyGrid(3, 25))).toThrow(/越界/);
  });

  it('normalizeHex 仅接受六位十六进制并统一大写', () => {
    expect(normalizeHex('3a7ca5')).toBe('3A7CA5');
    expect(normalizeHex('#3A7CA5')).toBe('3A7CA5');
    expect(normalizeHex('FFF')).toBeNull();
    expect(normalizeHex('GGGGGG')).toBeNull();
    expect(normalizeHex('12345')).toBeNull();
    expect(normalizeHex(' 123456 ')).toBe('123456');
  });

  it('formatCoords 使用 1 基坐标', () => {
    expect(formatCoords({ row: 0, col: 0 })).toBe('R1C1');
    expect(formatCoords({ row: 2, col: 4 })).toBe('R3C5');
  });
});
