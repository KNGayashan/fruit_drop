FROM node:22-bookworm-slim

WORKDIR /app

# Install backend deps first so this layer is cached unless package*.json changes.
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Backend (API + admin dashboard) and the game frontend it now serves
# same-origin (see backend/server.js) — no separate frontend server/build step.
COPY backend ./backend
COPY index.html script.js styles.css ./
COPY img ./img

ENV NODE_ENV=production
ENV PORT=3004
EXPOSE 3004

# SQLite DB and admin-uploaded images must survive container restarts/rebuilds
# — mount these as volumes (see docker-compose.yml) rather than relying on
# what's baked into the image.
VOLUME ["/app/backend/data", "/app/backend/uploads"]

CMD ["node", "backend/server.js"]
