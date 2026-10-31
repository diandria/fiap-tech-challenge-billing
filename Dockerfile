# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app
# The Prisma engine links against libssl; without openssl on Alpine the target
# detection picks an openssl 1.1 binary that does not exist here.
RUN apk add --no-cache openssl
COPY package*.json ./
# Before npm ci: the @prisma/client postinstall runs prisma generate, and with
# no schema it emits a stub without the models.
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]
