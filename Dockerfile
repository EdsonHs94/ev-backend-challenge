FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS checks
COPY tsconfig.json eslint.config.mjs ./
COPY src ./src
COPY migrations ./migrations
COPY test ./test
CMD ["sh", "-c", "npm run lint && npm run typecheck && npm test"]

FROM checks AS build
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
