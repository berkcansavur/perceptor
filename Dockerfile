FROM node:20-alpine

WORKDIR /app

# Install only production deps (web-tree-sitter + tree-sitter-wasms)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY analyzer ./analyzer
COPY server ./server
COPY web ./web
COPY bin ./bin

EXPOSE 4173

# Repos are mounted at /workspace; the user picks one via "Open Folder".
ENV CONTAINER_WORKSPACE=/workspace
CMD ["node", "bin/visualise.js", "--serve-only", "--no-open", "--port", "4173", "/workspace"]
