# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force

# Copy source and build frontend
COPY vite.config.js index.html ./
COPY src/ ./src/
RUN npm run build

# ---- Production stage ----
FROM node:20-slim

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server code
COPY server/ ./server/

# Create cache directory for thumbnails and manifest
RUN mkdir -p /app/cache

# Non-root user for security
RUN groupadd -r nodeapp && useradd -r -g nodeapp -d /app -s /sbin/nologin nodeapp \
    && chown -R nodeapp:nodeapp /app
USER nodeapp

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/albums').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
