# Playwright's image ships Node plus the exact Chromium build playwright-core 1.64.0 expects.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev

EXPOSE 8080
CMD ["npm", "start"]
