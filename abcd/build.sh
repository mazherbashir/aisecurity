#!/bin/bash

set -e

echo "============================================"
echo "  Building Frontend (React - Vite)"
echo "============================================"
cd src/frontend
npm install
npm run build

echo "============================================"
echo "  Cleaning old static files"
echo "============================================"
cd ../..
STATIC_DIR="src/backend/src/main/resources/static"

if [ -d "$STATIC_DIR" ]; then
    rm -rf "$STATIC_DIR"
fi

mkdir -p "$STATIC_DIR"

echo "============================================"
echo "  Copying new frontend build to backend"
echo "============================================"
cp -r src/frontend/dist/* "$STATIC_DIR"

echo "============================================"
echo "  Restoring favicon.ico"
echo "============================================"
if [ -f src/backend/src/main/resources/favicon.ico ]; then
    cp src/backend/src/main/resources/favicon.ico "$STATIC_DIR"
fi

echo "============================================"
echo "  Building Backend (Maven Wrapper)"
echo "============================================"
cd src/backend
./mvnw clean package -DskipTests

echo "============================================"
echo "  Cleaning backend/target folder"
echo "============================================"

cd target

# SAFETY CHECK — ensure we are inside src/backend/target
if [[ "$PWD" != *"/src/backend/target" ]]; then
    echo "ERROR: Not inside src/backend/target. Aborting cleanup."
    exit 1
fi

# Delete all directories
find . -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} \;

# Delete .jar.original explicitly
rm -f *.jar.original 2>/dev/null || true


# Ensure favicon.ico exists
if [ ! -f favicon.ico ]; then
    cp ../src/main/resources/favicon.ico .
fi

cd ../../..

echo "============================================"
echo "  BUILD COMPLETE"
echo "============================================"
echo "JAR generated at: src/backend/target/*.jar"
