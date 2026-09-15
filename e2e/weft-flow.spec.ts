import { expect, test } from '@playwright/test';

const cell = (row: number, col: number) =>
  `[data-testid="cell"][data-row="${row}"][data-col="${col}"]`;

const weftSelect = (color: string) => `[data-testid="weft-select"][data-color="${color}"]`;

/**
 * 采样核心块 (0,0) 格右上角送纬器角标周围一圈像素，返回深色点数。
 * 2×2 纹样：3×3 铺展共 6×6 格，cell = 画布/6，核心块起点 (W/3, H/3)；
 * 角标半径 10、内缩 1，圆心 (W/2 − 11, H/3 + 11)。角标底色 #1F2937。
 */
const countDarkBadgePixels = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="seam-canvas"]')!;
    const ctx = canvas.getContext('2d')!;
    const cx = canvas.width / 2 - 11;
    const cy = canvas.height / 3 + 11;
    let dark = 0;
    for (let k = 0; k < 8; k += 1) {
      const angle = (Math.PI / 4) * k;
      const x = Math.round(cx + 7 * Math.cos(angle));
      const y = Math.round(cy + 7 * Math.sin(angle));
      const { data } = ctx.getImageData(x, y, 1, 1);
      if (data[0] < 80 && data[1] < 80 && data[2] < 90) dark += 1;
    }
    return dark;
  });

test.describe('送纬器配台', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('填满纹样、分配送纬器、生成配台单并核对 Canvas 角标，断纹定位仍可操作', async ({
    page,
  }) => {
    // 应用 2×2 新尺寸：空网格下配台区说明具体阻断原因
    await page.getByTestId('rows-input').fill('2');
    await page.getByTestId('cols-input').fill('2');
    await page.getByTestId('apply-dimensions').click();
    await expect(page.getByTestId('weft-blocker')).toContainText('4 处空格');

    // 填满纹样：E8E8E8 涂主对角线，B91C1C 涂副对角线
    await page.getByTestId('palette').getByRole('button', { name: /E8E8E8/ }).click();
    await page.locator(cell(0, 0)).click();
    await page.locator(cell(1, 1)).click();
    await page.getByTestId('palette').getByRole('button', { name: /B91C1C/ }).click();
    await page.locator(cell(0, 1)).click();
    await page.locator(cell(1, 0)).click();

    // 阻断解除：按首次出现行列顺序列出唯一颜色，带色值、首用坐标与格数
    await expect(page.getByTestId('weft-blocker')).not.toBeVisible();
    const entries = page.getByTestId('weft-entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toHaveAttribute('data-color', 'E8E8E8');
    await expect(entries.nth(0)).toContainText('#E8E8E8');
    await expect(entries.nth(0)).toContainText('首用 R1C1 · 2 格');
    await expect(entries.nth(1)).toHaveAttribute('data-color', 'B91C1C');
    await expect(entries.nth(1)).toContainText('首用 R1C2 · 2 格');

    // 未分配前不生成配台单，画布上也没有送纬器角标
    await expect(page.getByTestId('weft-pending')).toContainText('还有 2 种颜色未分配');
    await expect(page.getByTestId('weft-plan')).not.toBeVisible();
    expect(await countDarkBadgePixels(page)).toBe(0);

    // 重复占用：两色都选 2 号，对应选择项旁提示，配台单仍被拦截
    await page.locator(weftSelect('E8E8E8')).selectOption('2');
    await expect(page.getByTestId('weft-pending')).toContainText('还有 1 种颜色未分配');
    await page.locator(weftSelect('B91C1C')).selectOption('2');
    const conflicts = page.getByTestId('weft-conflict');
    await expect(conflicts).toHaveCount(2);
    await expect(conflicts.first()).toContainText('2 号送纬器重复占用');
    await expect(page.getByTestId('weft-plan')).not.toBeVisible();

    // 改正占用：B91C1C 改 5 号，生成按送纬器号排序的配台单（含各色格数量）
    await page.locator(weftSelect('B91C1C')).selectOption('5');
    await expect(page.getByTestId('weft-conflict')).toHaveCount(0);
    const planRows = page.getByTestId('weft-plan-row');
    await expect(planRows).toHaveCount(2);
    await expect(planRows.nth(0)).toHaveAttribute('data-feeder', '2');
    await expect(planRows.nth(0)).toContainText('2 号送纬器');
    await expect(planRows.nth(0)).toContainText('#E8E8E8');
    await expect(planRows.nth(0)).toContainText('2 格');
    await expect(planRows.nth(1)).toHaveAttribute('data-feeder', '5');
    await expect(planRows.nth(1)).toContainText('#B91C1C');

    // Canvas 角标：核心块 (0,0) 格右上角出现深色送纬器角标
    expect(await countDarkBadgePixels(page)).toBeGreaterThanOrEqual(6);

    // 原有断纹定位仍可操作：该纹样两方向均有断纹
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'fail');
    await page.getByTestId('locate-horizontal-0').click();
    await expect(page.locator(cell(0, 0))).toHaveAttribute('data-located', 'true');
    await expect(page.locator(cell(0, 1))).toHaveAttribute('data-located', 'true');
    await page.getByTestId('locate-horizontal-0').click();
    await expect(page.locator(cell(0, 0))).not.toHaveAttribute('data-located', 'true');

    // 修改任一色格：配台草稿与配台单立即清空，Canvas 角标同步消失
    await page.locator(cell(0, 0)).click(); // 当前画笔 B91C1C
    await expect(page.getByTestId('weft-plan')).not.toBeVisible();
    await expect(page.getByTestId('weft-pending')).toContainText('还有 2 种颜色未分配');
    expect(await countDarkBadgePixels(page)).toBe(0);
  });
});
