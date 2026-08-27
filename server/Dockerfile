FROM node:22-slim

WORKDIR /app

# node:*-slim ships without libssl. Prisma's query engine needs it to detect the
# right engine binary (otherwise it warns and guesses openssl-1.1.x); ca-certificates
# is needed for the TLS connection to Neon.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# Applies pending migrations, then starts the API + cron scheduler in one process.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
