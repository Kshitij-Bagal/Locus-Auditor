@echo off
title Locus FE Audit Command Center
echo ========================================================
echo   Lenskart Locus FE Quality & Audit Command Center
echo ========================================================
echo.
echo Starting local audit server on http://localhost:3000 ...
echo.

start "" http://localhost:3000
npm.cmd run dev -- --host 0.0.0.0 --port 3000
pause
