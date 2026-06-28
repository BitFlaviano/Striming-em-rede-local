@echo off
echo ============================================
echo   SmartTV Media Server
echo ============================================
echo.
echo Derrubando processos antigos...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Iniciando servidor...
cd /d "%~dp0"
npm start
pause
