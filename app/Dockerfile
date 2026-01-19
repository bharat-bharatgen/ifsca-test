# Stage 1: Dependencies
# Install dependencies only when needed
FROM node:20-alpine AS deps
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm --force
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Stage 2: Build
# Rebuild the source code only when needed
FROM node:20-alpine AS builder
WORKDIR /app
# Install pnpm globally in the builder stage
RUN npm install -g pnpm --force
ENV CI=true
RUN apk add --no-cache openssl
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN pnpm install
RUN npx prisma generate
RUN pnpm run build

# Stage 3: Deploy & Run
# Production image, copy all the files and run next
FROM node:20-alpine AS runner
WORKDIR /app
# Install OpenSSL for Prisma
RUN apk add --no-cache openssl
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV HOME /home/nextjs
RUN addgroup -S -g 1001 nodejs
RUN adduser -S -u 1001 nextjs
RUN mkdir -p /home/nextjs/.npm /home/nextjs/.cache /app/.next /app/node_modules
RUN chown -R nextjs:nodejs /home/nextjs /app/.next /app/node_modules /app
# You only need to copy next.config.js if you are NOT using the default configuration
# COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs prisma ./prisma/

USER nextjs
EXPOSE 3000
ENV PORT 3000

# Run database migrations on startup, then start Next.js server
CMD ["sh", "-lc", "npx prisma migrate deploy && node server.js"]


