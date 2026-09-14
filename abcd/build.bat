@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Building Frontend (React - Vite)
echo ============================================
cd src\frontend
call npm install
call npm run build

if %errorlevel% neq 0 (
    echo React build failed.
    exit /b %errorlevel%
)

echo ============================================
echo   Cleaning old static files
echo ============================================
cd ..\..
if exist src\backend\src\main\resources\static (
    rmdir /s /q src\backend\src\main\resources\static
)
mkdir src\backend\src\main\resources\static

echo ============================================
echo   Copying new frontend build to backend
echo ============================================
xcopy /E /I /Y src\frontend\dist\* src\backend\src\main\resources\static\

echo ============================================
echo   Restoring favicon.ico
echo ============================================
if exist src\backend\src\main\resources\favicon.ico (
    copy /Y src\backend\src\main\resources\favicon.ico src\backend\src\main\resources\static\
)

echo ============================================
echo   Building Backend (Maven)
echo ============================================
cd src\backend
call .\mvnw.cmd clean package -DskipTests

if %errorlevel% neq 0 (
    echo Maven build failed.
    exit /b %errorlevel%
)

echo ============================================
echo   BUILD COMPLETE
echo ============================================
echo JAR generated at: src\backend\target\*.jar


echo ============================================
echo   Cleaning target folder (preserving only jar, properties, favicon)
echo ============================================

REM Move to script directory (base project folder)
cd /d "%~dp0"

REM Move into src\backend\target safely
cd src\backend\target 2>nul
if errorlevel 1 (
    echo ERROR: src\backend\target folder not found.
    exit /b 1
)

REM SAFETY CHECK — ensure we are REALLY inside src\backend\target
echo Current directory: %cd%
echo %cd% | findstr /I "src\backend\target" >nul
if errorlevel 1 (
    echo ERROR: Not inside src\backend\target. Aborting cleanup.
    exit /b 1
)

REM Delete all folders silently
for /d %%D in (*) do (
    rmdir /s /q "%%D" 2>nul
)

REM Delete .jar.original explicitly
del /q "*.jar.original" 2>nul


REM Ensure favicon.ico exists
if not exist favicon.ico (
    copy /Y ..\src\main\resources\favicon.ico . >nul
)

cd ..\..\..

endlocal
