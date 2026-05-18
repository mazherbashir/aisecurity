@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Building Frontend (React - Vite)
echo ============================================
cd frontend
call npm install
call npm run build

if %errorlevel% neq 0 (
    echo React build failed.
    exit /b %errorlevel%
)

echo ============================================
echo   Cleaning old static files
echo ============================================
cd ..
if exist backend\src\main\resources\static (
    rmdir /s /q backend\src\main\resources\static
)
mkdir backend\src\main\resources\static

echo ============================================
echo   Copying new frontend build to backend
echo ============================================
xcopy /E /I /Y frontend\dist\* backend\src\main\resources\static\

echo ============================================
echo   Building Backend (Maven)
echo ============================================
cd backend
call .\mvnw.cmd clean package -DskipTests


if %errorlevel% neq 0 (
    echo Maven build failed.
    exit /b %errorlevel%
)

echo ============================================
echo   BUILD COMPLETE
echo ============================================
echo JAR generated at: backend\target\*.jar

endlocal
