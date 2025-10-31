# Multi-stage Dockerfile for Next.js (App Router) production build

# 1) Base dependencies
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 2) Install dependencies with clean, reproducible installs
FROM base AS deps
# Install dependencies only using lockfile for reproducibility
COPY package.json package-lock.json ./
RUN npm ci

# 3) Build the app
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build CSS then Next.js
RUN npm run build

# 4) Production runtime using Next.js standalone output
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy only the standalone server and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# If your build generated a public/styles.css via the tailwind build step, it will be inside public already

# Ensure proper ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Start the Next.js standalone server
CMD ["node", "server.js"]
