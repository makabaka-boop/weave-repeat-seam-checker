# 提花小样接缝校验台

纯浏览器工作台（TypeScript + React + Vite），用于在投产前检查提花小样在织机上
连续复制后是否会在左右（水平）或上下（垂直）边界产生断纹。无业务后端、不访问任何外部服务。

## 判定规则

- 纹样尺寸：2–24 行、2–24 列，逐格填色；颜色按**六位大写十六进制值**比较。
- **水平方向**：逐行比较核心块首列与末列色格，全部相等才可接。
- **垂直方向**：逐列比较核心块首行与末行色格，全部相等才可接。
- 四个角格同时参加水平、垂直两次比较（双重归属）。
- 不匹配坐标按先行后列排序，在核心块两侧成对标出；每条接缝给出唯一位置
  （如 `第 3 行：R3C1 (#FF0000) ↔ R3C6 (#112233)`），可逐格复核。
- Canvas 2D 展示 3×3 循环铺展：中央为核心块，四周为复制块，红框标出断纹端点。
- 尺寸改变后旧网格、预览与结论立即失效（清空重填）。
- 空格、非法颜色或越界尺寸只产生字段级错误，**绝不返回部分判定**。

## 本地开发

```bash
npm install
npm run dev          # 开发服务器
npm run test:unit    # Vitest：双向通过 / 单向断纹 / 角格双重归属 / 排序 / 字段级错误
npm run build        # 类型检查 + 生产构建
npm run test:e2e     # Playwright：一次编辑到定位的主流程（需先安装浏览器）
```

安装 E2E 浏览器：`npx playwright install chromium`（网络受限时可用镜像
`PLAYWRIGHT_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/playwright npx playwright install chromium`）。

## Docker（只运行 web）

```bash
docker compose up --build         # 默认宿主端口 8080
WEB_PORT=9000 docker compose up   # 覆盖宿主端口
```

`docker compose up` 仅启动 web（nginx 静态托管 `dist`），不存在任何后端服务。

## 一次性验收服务 verify

```bash
docker compose --profile verify run --rm verify
```

该容器内依次执行：Vitest 单测 → 生产构建 → Playwright 主流程，全部通过后退出。
