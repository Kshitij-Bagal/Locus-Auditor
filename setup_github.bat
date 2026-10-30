@echo off
title Push Locus Auditor to GitHub
echo ========================================================
echo   Push Locus Auditor to GitHub
echo ========================================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Git is not currently installed on your computer.
    echo.
    echo Please install Git from: https://git-scm.com/downloads
    echo Or install GitHub Desktop from: https://desktop.github.com/
    echo.
    pause
    exit /b
)

set /p REPO_URL="Enter your GitHub Repository URL (e.g. https://github.com/username/locus-auditor.git): "

if "%REPO_URL%"=="" (
    echo Repository URL cannot be empty.
    pause
    exit /b
)

echo.
echo Initializing Git repository...
git init
git add .
git commit -m "Deploy Locus FE Quality Audit Command Center"
git branch -M main
git remote add origin %REPO_URL%
git push -u origin main --force

echo.
echo ========================================================
echo   Code pushed to GitHub successfully!
echo   Connect this repository to Vercel at https://vercel.com/new
echo ========================================================
pause
