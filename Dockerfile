# Stage 1: Build the React SPA
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build production bundle with Vite
RUN npm run build

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Nginx template (nginx:alpine automatically substitutes ${PORT} into /etc/nginx/conf.d/default.conf)
COPY nginx.conf /etc/nginx/templates/default.conf.template

ENV PORT=8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
