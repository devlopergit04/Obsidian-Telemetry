FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV OT_HOST=0.0.0.0
ENV OT_PORT=1392
ENV OT_HOME=/var/lib/obsidian-telemetry

RUN addgroup -S obsidian && adduser -S obsidian -G obsidian \
  && mkdir -p /var/lib/obsidian-telemetry \
  && chown -R obsidian:obsidian /var/lib/obsidian-telemetry

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

USER obsidian
EXPOSE 1392
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:1392/api/health || exit 1

CMD ["node", "dist-server/server.js"]
