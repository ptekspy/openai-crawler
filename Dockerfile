FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm typecheck

CMD ["pnpm", "crawl"]
