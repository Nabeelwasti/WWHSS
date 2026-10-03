# ---------- Build stage: full dev deps, compiles TypeScript, generates Prisma client ----------
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- Production stage: only what's actually needed at runtime ----------
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# Real non-root user — running the app as root inside the container is an
# unnecessary privilege escalation risk if the process is ever compromised.
RUN groupadd -r wwhs && useradd -r -g wwhs wwhs

COPY package*.json ./
RUN npm install --omit=dev

# The Prisma client's generated query engine lives in node_modules/.prisma
# and is version-matched to the schema — copied from the build stage rather
# than regenerated, since the Prisma CLI (a dev dependency) isn't installed
# here.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

USER wwhs
EXPOSE 4000

# A real container-level health check, not just an exposed port — an
# orchestrator can see this container is actually serving traffic, not just
# that the process hasn't crashed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
