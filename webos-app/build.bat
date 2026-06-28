@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  SmartTV Media - Empacotar webOS App
echo ============================================
echo.

REM Check for ares-cli
where ares-package >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] ares-package nao encontrado. Instalando...
    call npm install -g @webosose/ares-cli
    if !ERRORLEVEL! neq 0 (
        echo [ERRO] Falha ao instalar @webosose/ares-cli
        pause
        exit /b 1
    )
    echo [OK] ares-cli instalado
)

set APP_DIR=%~dp0
set OUTPUT_DIR=%APP_DIR%build

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo [INFO] Empacotando app...
ares-package "%APP_DIR%" -o "%OUTPUT_DIR%"
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Falha ao empacotar
    pause
    exit /b 1
)

echo [OK] Pacote criado em: %OUTPUT_DIR%
echo.

REM List the generated IPK
for %%f in ("%OUTPUT_DIR%\*.ipk") do (
    echo  Arquivo: %%~nxf
    set IPK_FILE=%%f
)

echo.
echo ============================================
echo  Para instalar na TV:
echo ============================================
echo.
echo  1. Na TV, abra o app "Developer Mode" (LG Content Store)
echo     e ative o modo desenvolvedor. Anote o IP e senha.
echo.
echo  2. Conecte o PC a TV:
echo     ares-device -a -i ^<IP_DA_TV^>
echo     (senha: a que foi definida no Developer Mode)
echo.
echo  3. Instale o app:
echo     ares-install --device ^<NOME_DO_DEVICE^> "%OUTPUT_DIR%\*.ipk"
echo.
echo  Ou use:
echo     ares-install --device ^<NOME_DO_DEVICE^> --server ^<IP_DA_TV^>:%IP_DA_TV%^ "%OUTPUT_DIR%\*.ipk"
echo.
pause
