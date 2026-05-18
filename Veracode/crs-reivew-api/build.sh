#!/bin/bash

set -e

echo "============================================"
echo "  Building Frontend (React - Vite)"
echo "============================================"
cd frontend
npm install
npm run build

echo "============================================"
echo "  Cleaning old static files"
echo "============================================"
cd ..
STATIC_DIR="backend/src/main/resources/static"

if [ -d "$STATIC_DIR" ]; then
    rm -rf "$STATIC_DIR"
fi

mkdir -p "$STATIC_DIR"

echo "============================================"
echo "  Copying new frontend build to backend"
echo "============================================"
cp -r frontend/dist/* "$STATIC_DIR"

echo "============================================"
echo "  Building Backend (Maven Wrapper)"
echo "============================================"
cd backend
../mvnw clean package -DskipTests

echo "============================================"
echo "  BUILD COMPLETE"
echo "============================================"
echo "JAR generated at: backend/target/*.jar"
