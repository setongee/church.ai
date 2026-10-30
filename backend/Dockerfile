FROM node:22-bookworm-slim

# Chrome's system libraries - Remotion renders reels and stills with a headless Chrome.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 \
    libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 \
    libcairo2 libcups2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# One persistent volume mounted at /data holds everything written at runtime (uploads, downloaded Bibles).
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["sh", "-c", "mkdir -p $DATA_DIR/uploads $DATA_DIR/bibles && rm -rf uploads data && ln -s $DATA_DIR/uploads uploads && mkdir data && ln -s $DATA_DIR/bibles data/bibles && exec node src/server.js"]
