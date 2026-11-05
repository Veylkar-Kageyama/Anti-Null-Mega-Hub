FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
RUN mkdir -p /data/uploads /data/vault && chown -R node:node /data

ENV NODE_ENV=production
ENV PORT=4174
ENV UPLOAD_DIR=/data/uploads
ENV VAULT_DIR=/data/vault

USER node
EXPOSE 4174
CMD ["npm", "run", "start:server"]
