FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Used only while compiling; runtime configuration is supplied by the operator.
ENV BETTER_AUTH_URL=http://localhost:3000
ENV BETTER_AUTH_SECRET=build-only-placeholder-not-a-runtime-secret-32-characters
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/.data/uploads && chown -R node:node /app/.data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
