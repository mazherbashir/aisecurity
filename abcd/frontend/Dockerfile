# ============================================================
# Stage 1 — Frontend Build (React + Vite)
# ============================================================
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . ./
RUN npm run build

# ============================================================
# Stage 2 — Runtime (Nginx serving static assets on port 3000)
# ============================================================
FROM nginx:alpine AS runtime

LABEL maintainer="crsaitool"
LABEL description="CRS Review Frontend — Container Image for Global CaaS"

COPY --from=build /app/dist /usr/share/nginx/html

# Configure Nginx to listen on port 3000, handle SPA routing, and proxy API calls
RUN echo 'server { \
    listen 3000; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://host.docker.internal:8080/api/; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    location /getfinalreport { \
        proxy_pass http://host.docker.internal:8080/getfinalreport; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
