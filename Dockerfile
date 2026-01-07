FROM node:20

WORKDIR /usr/src/app

# Copy manifests and install deps (keep devDeps for ts-node/nodemon)
COPY package.json package.json
COPY package-lock.json package-lock.json
RUN npm ci

# Copy project files
COPY tsconfig.json tsconfig.json
COPY src src

# Default command can be overridden by docker-compose
CMD ["npx", "ts-node", "src/n8n/worker.ts"]