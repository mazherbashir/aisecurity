# ============================================================
# Stage 1 — Frontend Build (React + Vite)
# ============================================================
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY src/frontend/package*.json ./
RUN npm ci || npm install

COPY src/frontend/ ./
RUN npm run build

# ============================================================
# Stage 2 — Backend Build (Spring Boot + Maven)
# Builds fat JAR containing static frontend assets.
# ============================================================
FROM eclipse-temurin:21-jdk-alpine AS backend-build

WORKDIR /app/backend

# Copy Maven wrapper and POM first (layer-cache friendly)
COPY src/backend/mvnw src/backend/mvnw.cmd ./
COPY src/backend/.mvn .mvn
COPY src/backend/pom.xml ./

RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Copy Java backend sources
COPY src/backend/src src

# Copy compiled frontend from Stage 1 into backend static resources
COPY --from=frontend-build /app/frontend/dist src/main/resources/static

# Build fat JAR
RUN ./mvnw clean package -DskipTests -B

# ============================================================
# Stage 3 — Runtime
# Minimal JRE image exposing port 8080
# ============================================================
FROM eclipse-temurin:21-jre-alpine AS runtime

LABEL maintainer="crsaitool"
LABEL description="CRS Review API — Container Image for Kubernetes"

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Persistent data directories
RUN mkdir -p veracode/logs veracode/history \
    && chown -R appuser:appgroup /app

# Copy built fat JAR from Stage 2
COPY --from=backend-build /app/backend/target/*.jar app.jar

# Copy default application.properties
COPY --from=backend-build /app/backend/src/main/resources/application.properties application.properties

USER appuser

# Container default port 8080
EXPOSE 8080

# Health-check endpoint
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-Dspring.config.location=file:./application.properties", \
    "-jar", "app.jar"]
