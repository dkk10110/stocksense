FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# Applies pending migrations, then starts the API + cron scheduler in one process.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
