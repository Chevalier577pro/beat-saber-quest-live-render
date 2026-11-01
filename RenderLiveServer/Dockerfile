FROM bluenviron/mediamtx:1.21.3 AS media
FROM node:22-alpine
WORKDIR /app
COPY --from=media /mediamtx /usr/local/bin/mediamtx
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js mediamtx.yml ./
COPY public ./public
ENV NODE_ENV=production
CMD ["node", "server.js"]
