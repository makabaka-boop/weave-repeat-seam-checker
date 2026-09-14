# ---- web：生产构建 + 静态托管（纯浏览器工作台，无业务后端） ----
FROM node:20-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

# ---- verify：一次性验收（Vitest 单测 + 生产构建 + Playwright 主流程） ----
FROM node:20-bookworm-slim AS verify
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json* ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
CMD ["sh", "-c", "npm run test:unit && npm run build && npm run test:e2e"]
