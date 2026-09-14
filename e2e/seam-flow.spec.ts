import { expect, test } from '@playwright/test';

const cell = (row: number, col: number) =>
  `[data-testid="cell"][data-row="${row}"][data-col="${col}"]`;

test.describe('提花接缝校验台', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('编辑色格制造断纹后，可定位到唯一接缝位置', async ({ page }) => {
    // 初始默认菱形纹样：两个方向都可连续铺展
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'pass');
    await expect(page.getByTestId('horizontal-result')).toContainText('可接');
    await expect(page.getByTestId('vertical-result')).toContainText('可接');

    // 用红色涂第 1 行中间格（R1C3），只破坏垂直方向第 3 列的首末行比较
    await page.getByTestId('palette').getByRole('button', { name: /B91C1C/ }).click();
    await page.locator(cell(0, 2)).click();

    // 水平仍可接、垂直出现唯一断纹
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'fail');
    await expect(page.getByTestId('horizontal-result')).toContainText('可接');
    await expect(page.getByTestId('vertical-result')).toContainText('断纹');

    const mismatchRow = page.getByTestId('vertical-result').locator('.mismatch-list li');
    await expect(mismatchRow).toHaveCount(1);
    await expect(mismatchRow).toContainText('R1C3');
    await expect(mismatchRow).toContainText('R5C3');

    // 编辑前两个端点都没有定位高亮
    await expect(page.locator(cell(0, 2))).toHaveAttribute('data-mismatch', 'true');
    await expect(page.locator(cell(4, 2))).not.toHaveAttribute('data-located', 'true');

    // 点击“在预览中定位”，核心块两侧成对标出
    await page.getByTestId('locate-vertical-2').click();
    await expect(page.getByTestId('locate-vertical-2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(cell(0, 2))).toHaveAttribute('data-located', 'true');
    await expect(page.locator(cell(4, 2))).toHaveAttribute('data-located', 'true');

    // 再次点击取消定位
    await page.getByTestId('locate-vertical-2').click();
    await expect(page.getByTestId('locate-vertical-2')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator(cell(0, 2))).not.toHaveAttribute('data-located', 'true');
  });

  test('非法尺寸只给字段级错误；清空色格不产生部分判定', async ({ page }) => {
    await page.getByTestId('rows-input').fill('1');
    await page.getByTestId('cols-input').fill('99');
    await page.getByTestId('apply-dimensions').click();

    await expect(page.getByTestId('rows-error')).toBeVisible();
    await expect(page.getByTestId('cols-error')).toBeVisible();
    // 旧结论仍在（未发生部分应用）
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'pass');

    // 改回合法尺寸并应用：旧网格与结论失效
    await page.getByTestId('rows-input').fill('3');
    await page.getByTestId('cols-input').fill('3');
    await page.getByTestId('apply-dimensions').click();
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'incomplete');
    await expect(page.getByTestId('issue-summary')).toContainText('空格 9 处');
    await expect(page.getByTestId('horizontal-result')).not.toBeVisible();

    // 填满后恢复判定
    const emptyCell = page.locator('[data-testid="cell"][data-empty="true"]').first();
    await emptyCell.click({ clickCount: 1 });
    // 逐格填满剩余空格
    const count = await page.locator('[data-testid="cell"][data-empty="true"]').count();
    for (let i = 0; i < count; i += 1) {
      await page.locator('[data-testid="cell"][data-empty="true"]').first().click();
    }
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'pass');
  });

  test('自定义非法颜色只在字段级报错', async ({ page }) => {
    await page.getByTestId('custom-hex').fill('GGG');
    await page.getByTestId('apply-custom-hex').click();
    await expect(page.getByTestId('custom-error')).toBeVisible();
  });

  test('极端比例 24×2 与 2×24：九块纹样完整落在画布内', async ({ page }) => {
    // 采样画布中心某一坐标的像素，断言其颜色接近指定色值。
    const samplePixel = (p: typeof page, xRatio: number, yRatio: number) =>
      p.evaluate(
        ({ xRatio, yRatio }) => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="seam-canvas"]')!;
          const ctx = canvas.getContext('2d')!;
          const x = Math.floor(canvas.width * xRatio);
          const y = Math.floor(canvas.height * yRatio);
          const { data } = ctx.getImageData(x, y, 1, 1);
          return { r: data[0], g: data[1], b: data[2] };
        },
        { xRatio, yRatio },
      );
    const isDark = (px: { r: number; g: number; b: number }) => px.r < 60 && px.g < 60 && px.b < 60;

    // 选深色画笔（#111827）
    await page.getByTestId('palette').getByRole('button', { name: /111827/ }).click();

    // 24 行 × 2 列：高度受限，最底部一行的中心必须是已涂色（修复前画到了画布外）
    await page.getByTestId('rows-input').fill('24');
    await page.getByTestId('cols-input').fill('2');
    await page.getByTestId('apply-dimensions').click();
    let empty = await page.locator('[data-testid="cell"][data-empty="true"]').count();
    while (empty > 0) {
      await page.locator('[data-testid="cell"][data-empty="true"]').first().click();
      empty -= 1;
    }
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'pass');
    // 布局：cell = 1/72 画布，内容水平居中（offset 33/72），取左列中心避开网格线。
    // 末行（第九块底边）与首行（顶边）的中心像素都必须是已涂色。
    expect(isDark(await samplePixel(page, 33.5 / 72, 71.5 / 72))).toBe(true);
    expect(isDark(await samplePixel(page, 33.5 / 72, 0.5 / 72))).toBe(true);

    // 2 行 × 24 列：宽度受限，最右一列的中心必须是已涂色
    await page.getByTestId('rows-input').fill('2');
    await page.getByTestId('cols-input').fill('24');
    await page.getByTestId('apply-dimensions').click();
    empty = await page.locator('[data-testid="cell"][data-empty="true"]').count();
    while (empty > 0) {
      await page.locator('[data-testid="cell"][data-empty="true"]').first().click();
      empty -= 1;
    }
    await expect(page.getByTestId('conclusion')).toHaveAttribute('data-status', 'pass');
    // 布局：cell = 1/72 画布，内容垂直居中（offset 33/72），取顶行中心避开网格线。
    // 最右列（第九块右边）与最左列的中心像素都必须是已涂色。
    expect(isDark(await samplePixel(page, 71.5 / 72, 33.5 / 72))).toBe(true);
    expect(isDark(await samplePixel(page, 0.5 / 72, 33.5 / 72))).toBe(true);
  });
});
