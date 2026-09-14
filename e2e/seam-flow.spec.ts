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
});
