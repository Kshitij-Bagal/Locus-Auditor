@echo off
title Deploy Locus Auditor to Vercel
echo ========================================================
echo   Deploying Locus FE Audit Command Center to Vercel
echo ========================================================
echo.
echo This will publish your dashboard to a public HTTPS URL
echo so teams in multiple cities can access it simultaneously.
echo.
echo If prompted, press Enter or type 'Y' to accept defaults.
echo.
call npx vercel --prod
echo.
echo ========================================================
echo   Deployment complete! Share the generated URL with your team.
echo ========================================================
pause
