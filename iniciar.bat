@echo off
title SmartTV Media Server
cd /d "%~dp0"

set TASK_NAME=SmartTV Media Server
set ACTION=%1

if /i "%ACTION%"=="install" goto install
if /i "%ACTION%"=="uninstall" goto uninstall
if /i "%ACTION%"=="stop" goto stop
if /i "%ACTION%"=="status" goto status
if /i "%ACTION%"=="start" goto start
if /i "%ACTION%"=="" goto interactive

:install
echo ============================================
echo   Instalar Inicializacao Automatica
echo ============================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0install-service.ps1" -AppDir "%~dp0"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Servico instalado! O servidor inicia automaticamente ao logar.
) else (
    echo.
    echo Falha ao instalar. Execute como Administrador.
)
goto end

:uninstall
echo ============================================
echo   Remover Inicializacao Automatica
echo ============================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0install-service.ps1" -AppDir "%~dp0" -Uninstall
echo.
echo Feito.
goto end

:stop
echo ============================================
echo   Parando Servidor
echo ============================================
echo.
schtasks /end /tn "%TASK_NAME%" 2>nul
taskkill /f /im node.exe 2>nul
echo Servidor parado.
goto end

:status
echo ============================================
echo   Status do Servidor
echo ============================================
echo.
schtasks /query /tn "%TASK_NAME%" /fo LIST /v 2>nul | find "Status:" | find "Running" >nul
if %ERRORLEVEL% EQU 0 (
    echo Tarefa agendada: ATIVA
) else (
    echo Tarefa agendada: INATIVA
)
tasklist /fi "imagename eq node.exe" 2>nul | find /i "node.exe" >nul
if %ERRORLEVEL% EQU 0 (
    echo Servidor: RODANDO
    for /f "tokens=2 delims=:" %%a in ('curl.exe -s http://localhost:3000/api/network-info 2^>nul ^| findstr "selectedIP"') do (
        echo IP:%%a
    )
    if errorlevel 1 (
        echo IP: (local) http://localhost:3000
    )
) else (
    echo Servidor: PARADO
)
goto end

:interactive
echo ============================================
echo   SmartTV Media Server
echo ============================================
call :show_ip
echo.
echo [1] Iniciar servidor (segundo plano)
echo [2] Iniciar servidor (janela - modo debug)
echo [3] Parar servidor
echo [4] Status
echo [5] Instalar inicio automatico
echo [6] Watchdog (monitoramento/reinicio automatico)
echo [7] Sair
echo.
choice /c 1234567 /n /m "Escolha: "
if errorlevel 7 exit /b
if errorlevel 6 goto watchdog
if errorlevel 5 goto install
if errorlevel 4 goto status
if errorlevel 3 goto stop_quick
if errorlevel 2 goto start_debug
if errorlevel 1 goto start_bg

:start_bg
echo.
echo Iniciando em segundo plano...
wscript "%~dp0start-server.vbs"
echo Servidor iniciado em http://localhost:3000
timeout /t 3 /nobreak >nul
start http://localhost:3000
goto end

:start_debug
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Instale em: https://nodejs.org
    pause
    exit /b 1
)
if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)
echo Derrubando processos antigos...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Iniciando servidor (modo debug)...
echo Acesse: http://localhost:3000
echo.
start http://localhost:3000
node server.js
pause
goto end

:stop_quick
schtasks /end /tn "%TASK_NAME%" 2>nul
taskkill /f /im node.exe 2>nul
echo Servidor parado.
goto end

:start
echo Iniciando servidor em segundo plano...
wscript "%~dp0start-server.vbs"
timeout /t 2 /nobreak >nul
goto end

:watchdog
echo ============================================
echo   Watchdog - Monitoramento Continuo
echo ============================================
echo.
echo O watchdog verifica o servidor a cada 30s
echo e o reinicia automaticamente se cair.
echo.
echo Para encerrar o watchdog, feche esta janela
echo ou pressione Ctrl+C.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0watchdog.ps1" -AppDir "%~dp0"
pause
goto end

:show_ip
setlocal enabledelayedexpansion
echo.
echo Detectando IP da rede local...
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "& { $gw=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex; if ($gw) { $ip=(Get-NetIPAddress -InterfaceIndex $gw -AddressFamily IPv4).IPAddress; if ($ip) { $ip; exit } } $ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and !$_.SkipAsSource -and $_.InterfaceAlias -notlike '*Loopback*' -and $_.InterfaceAlias -notlike '*Hyper-V*' -and $_.InterfaceAlias -notlike '*vEthernet*' -and $_.InterfaceAlias -notlike '*Virtual*' -and $_.InterfaceAlias -notlike '*Bluetooth*' }).IPAddress | Select-Object -First 1; if (-not $ip) { $ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and !$_.SkipAsSource }).IPAddress | Select-Object -First 1 } if ($ip) { $ip } else { 'localhost' } }"') do set SERVER_IP=%%a
echo.
echo   ** SMARTTV: http://%SERVER_IP%:3000 **
echo   ** LOCAL:   http://localhost:3000   **
echo.
endlocal
goto :EOF

:end
echo.
