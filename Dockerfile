FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

RUN corepack enable

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm typecheck

CMD ["pnpm", "crawl"]
