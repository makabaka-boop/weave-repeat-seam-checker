import { describe, expect, it } from 'vitest';
import { createEmptyGrid, Grid, normalizeHex } from './seams';
import {
  buildWeftPlan,
  extractColors,
  findFeederConflicts,
  isDraftStale,
  isFeederNumber,
  unassignedColors,
  WeftDraft,
  weftBlocker,
  WEFT_FEEDER_COUNT,
} from './weft';

const gridFrom = (raw: (string | null)[][]): Grid =>
  raw.map((line) => line.map((v) => (v === null ? null : normalizeHex(v))));

describe('extractColors 首次出现排序与计数', () => {
  it('按色值首次出现的行列顺序提取唯一颜色，记录首坐标与格数', () => {
    const grid = gridFrom([
      ['FF0000', '00FF00', 'FF0000'],
      ['00FF00', '0000FF', 'FF0000'],
    ]);
    const entries = extractColors(grid);
    expect(entries.map((e) => e.color)).toEqual(['FF0000', '00FF00', '0000FF']);
    expect(entries[0]).toEqual({ color: 'FF0000', first: { row: 0, col: 0 }, count: 3 });
    expect(entries[1]).toEqual({ color: '00FF00', first: { row: 0, col: 1 }, count: 2 });
    expect(entries[2]).toEqual({ color: '0000FF', first: { row: 1, col: 1 }, count: 1 });
  });

  it('空格被跳过，顺序仍按首次出现的行列扫描', () => {
    const grid = gridFrom([
      [null, 'AAAAAA'],
      ['BBBBBB', 'AAAAAA'],
    ]);
    const entries = extractColors(grid);
    expect(entries.map((e) => e.color)).toEqual(['AAAAAA', 'BBBBBB']);
    expect(entries[0]).toMatchObject({ first: { row: 0, col: 1 }, count: 2 });
    expect(entries[1]).toMatchObject({ first: { row: 1, col: 0 }, count: 1 });
  });

  it('同行靠后的颜色先于下一行靠前的颜色出现', () => {
    const grid = gridFrom([
      ['111111', '222222'],
      ['333333', '111111'],
    ]);
    expect(extractColors(grid).map((e) => e.color)).toEqual(['111111', '222222', '333333']);
  });
});

describe('weftBlocker 阻断原因', () => {
  it('存在空格时报告空格数量', () => {
    expect(weftBlocker(createEmptyGrid(2, 3))).toEqual({ kind: 'empty', empties: 6 });
    const grid = gridFrom([
      ['AAAAAA', null],
      ['BBBBBB', 'AAAAAA'],
    ]);
    expect(weftBlocker(grid)).toEqual({ kind: 'empty', empties: 1 });
  });

  it('颜色数超过送纬器上限时报告具体种数', () => {
    const grid = gridFrom([
      ['000001', '000002', '000003'],
      ['000004', '000005', '000006'],
      ['000007', '000008', '000009'],
    ]);
    expect(weftBlocker(grid)).toEqual({ kind: 'too-many', total: 9 });
  });

  it('恰好八种颜色不阻断，空格优先于超上限', () => {
    const eight = gridFrom([
      ['000001', '000002', '000003'],
      ['000004', '000005', '000006'],
      ['000007', '000008', '000008'],
    ]);
    expect(weftBlocker(eight)).toBeNull();

    const nineWithEmpty = gridFrom([
      ['000001', '000002', '000003'],
      ['000004', '000005', '000006'],
      ['000007', '000008', null],
    ]);
    expect(weftBlocker(nineWithEmpty)).toEqual({ kind: 'empty', empties: 1 });
  });

  it('非法颜色单独报告', () => {
    const grid = gridFrom([
      ['AAAAAA', 'BBBBBB'],
      ['BBBBBB', 'AAAAAA'],
    ]);
    grid[1][1] = '#GG0011' as never; // 防御：绕过类型检查注入非法值
    expect(weftBlocker(grid)).toEqual({ kind: 'invalid', invalid: 1 });
  });
});

describe('占用冲突与未分配', () => {
  const entries = extractColors(
    gridFrom([
      ['FF0000', '00FF00'],
      ['0000FF', 'FF0000'],
    ]),
  );

  it('同一送纬器承载两种颜色即冲突，按首次出现顺序列出', () => {
    const draft: WeftDraft = { FF0000: 3, '00FF00': 3, '0000FF': 1 };
    expect(findFeederConflicts(entries, draft)).toEqual([
      { feeder: 3, colors: ['FF0000', '00FF00'] },
    ]);
  });

  it('未分配的颜色不参与冲突；不同送纬器无冲突', () => {
    expect(findFeederConflicts(entries, { FF0000: 2 })).toEqual([]);
    expect(
      findFeederConflicts(entries, { FF0000: 1, '00FF00': 2, '0000FF': 8 }),
    ).toEqual([]);
  });

  it('未分配颜色按首次出现顺序列出，非法送纬器号按未分配处理', () => {
    expect(unassignedColors(entries, { '00FF00': 4 })).toEqual(['FF0000', '0000FF']);
    expect(unassignedColors(entries, { FF0000: 0, '00FF00': 9, '0000FF': 1.5 })).toEqual([
      'FF0000',
      '00FF00',
      '0000FF',
    ]);
    expect(isFeederNumber(1)).toBe(true);
    expect(isFeederNumber(WEFT_FEEDER_COUNT)).toBe(true);
    expect(isFeederNumber(0)).toBe(false);
    expect(isFeederNumber(WEFT_FEEDER_COUNT + 1)).toBe(false);
    expect(isFeederNumber(undefined)).toBe(false);
  });
});

describe('buildWeftPlan 配台单生成', () => {
  const entries = extractColors(
    gridFrom([
      ['FF0000', '00FF00'],
      ['0000FF', 'FF0000'],
    ]),
  );

  it('存在未分配颜色时拦截，不生成配台单', () => {
    expect(buildWeftPlan(entries, { FF0000: 1, '00FF00': 2 })).toBeNull();
    expect(buildWeftPlan(entries, {})).toBeNull();
  });

  it('存在占用冲突时拦截，不生成配台单', () => {
    const draft: WeftDraft = { FF0000: 2, '00FF00': 2, '0000FF': 3 };
    expect(buildWeftPlan(entries, draft)).toBeNull();
  });

  it('全部分配且无冲突：按送纬器号排序并带各色格数量', () => {
    const draft: WeftDraft = { FF0000: 5, '00FF00': 1, '0000FF': 3 };
    expect(buildWeftPlan(entries, draft)).toEqual([
      { feeder: 1, color: '00FF00', count: 1 },
      { feeder: 3, color: '0000FF', count: 1 },
      { feeder: 5, color: 'FF0000', count: 2 },
    ]);
  });

  it('空纹样不生成配台单', () => {
    expect(buildWeftPlan([], {})).toBeNull();
  });
});

describe('isDraftStale 编辑后失效', () => {
  it('草稿引用了当前纹样不存在的颜色即失效', () => {
    const before = extractColors(
      gridFrom([
        ['FF0000', '00FF00'],
        ['00FF00', 'FF0000'],
      ]),
    );
    const draft: WeftDraft = { FF0000: 1, '00FF00': 2 };
    expect(isDraftStale(before, draft)).toBe(false);

    // 模拟编辑：00FF00 被改涂成 0000FF，草稿中的 00FF00 失去依托
    const after = extractColors(
      gridFrom([
        ['FF0000', '0000FF'],
        ['0000FF', 'FF0000'],
      ]),
    );
    expect(isDraftStale(after, draft)).toBe(true);
  });

  it('颜色集合不变（仅格数变化）不算失效', () => {
    const before = extractColors(
      gridFrom([
        ['FF0000', '00FF00'],
        ['00FF00', '00FF00'],
      ]),
    );
    const after = extractColors(
      gridFrom([
        ['FF0000', 'FF0000'],
        ['00FF00', '00FF00'],
      ]),
    );
    const draft: WeftDraft = { FF0000: 1, '00FF00': 2 };
    expect(isDraftStale(before, draft)).toBe(false);
    expect(isDraftStale(after, draft)).toBe(false);
  });
});
