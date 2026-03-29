# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
# If there's a backend package.json, we'd copy it too, but we found only root.
# Let's assume the root package.json handles everything or use standard setup.

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the frontend (Vite)
RUN npm run build

# If the backend needs a build step (TypeScript), compile it.
# Check if backend/tsconfig.json exists or use root one.
# For now, we'll assume the backend is TS and needs compiling.
# RUN npx tsc -p backend/tsconfig.json

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy built assets and necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/package*.json ./
# Copy node_modules too or re-install production ones
COPY --from=builder /app/node_modules ./node_modules

# Expose ports
EXPOSE 3000
EXPOSE 5173

# Start the application
# We use a script or concurrently if needed, but in production we usually serve them properly.
# For now, let's assume 'npm run start:traced' from package.json is the way.
CMD ["npm", "run", "start:traced"]
