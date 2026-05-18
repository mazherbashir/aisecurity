# ============================================================
# Stage 1 — Build
# Uses Maven wrapper to compile and package the fat JAR.
# ============================================================
FROM eclipse-temurin:17-jdk-alpine AS build

WORKDIR /workspace

# Copy Maven wrapper and POM first (layer-cache friendly)
COPY mvnw mvnw.cmd ./
COPY .mvn .mvn
COPY pom.xml .

# Download dependencies only (cached unless pom.xml changes)
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Copy source and build, skipping tests
COPY src src
RUN ./mvnw package -DskipTests -B

# ============================================================
# Stage 2 — Runtime
# Lean JRE image; only the fat JAR is copied in.
# ============================================================
FROM eclipse-temurin:17-jre-alpine AS runtime

LABEL maintainer="crsaitool"
LABEL description="CRS Review API — Veracode reporting backend"

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Persistent data directories (mount as volumes in production)
RUN mkdir -p veracode/logs veracode/history \
    && chown -R appuser:appgroup /app

# Copy the fat JAR from the build stage
COPY --from=build /workspace/target/*.jar app.jar

# Copy application.properties next to the JAR so Spring Boot
# picks it up from the working directory (overrides embedded config).
# In production, mount your own application.properties at /app/application.properties
COPY --from=build /workspace/src/main/resources/application.properties application.properties

USER appuser

# Port declared in application.properties (server.port=8081)
EXPOSE 8081

# Health-check — waits 30 s then polls /actuator/health every 10 s.
# Remove or adjust if Spring Actuator is not on the classpath.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8081/actuator/health || exit 1

ENTRYPOINT ["java", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-Dspring.config.location=file:./application.properties", \
    "-jar", "app.jar"]
