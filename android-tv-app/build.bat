@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  SmartTV Media Player - Build Android APK
echo ============================================
echo.

REM Auto-detect JDK (prefer JDK 21, fallback to system Java)
set JAVA_HOME=
for %%d in ("C:\Program Files\Java\jdk-21" "C:\Program Files\Java\jdk-17" "C:\Program Files\Java\jdk-11") do (
    if exist "%%~d\bin\javac.exe" (
        set JAVA_HOME=%%~d
        goto :javaFound
    )
)

REM Check if java is in PATH
where java >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Java encontrado no PATH
    goto :sdkCheck
)

echo [ERRO] JDK 11+ nao encontrado.
echo        Instale JDK 21 em C:\Program Files\Java\jdk-21
echo        https://adoptium.net/
pause
exit /b 1

:javaFound
echo [OK] JAVA_HOME = %JAVA_HOME%

:sdkCheck
REM Auto-detect Android SDK
if "%ANDROID_HOME%"=="" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
    ) else if exist "%USERPROFILE%\AppData\Local\Android\Sdk" (
        set ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk
    ) else (
        echo [ERRO] Android SDK nao encontrado.
        pause
        exit /b 1
    )
)
echo [OK] ANDROID_HOME = %ANDROID_HOME%

REM Write local.properties
echo sdk.dir=%ANDROID_HOME:\=\\% > "%~dp0local.properties"

REM Download Gradle wrapper jar if not present
if not exist "%~dp0gradle\wrapper\gradle-wrapper.jar" (
    echo [INFO] Baixando Gradle wrapper...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/gradle/gradle/raw/v8.7.0/gradle/wrapper/gradle-wrapper.jar' -OutFile '%~dp0gradle\wrapper\gradle-wrapper.jar' -ErrorAction Stop"
    if !ERRORLEVEL! neq 0 (
        echo [ERRO] Falha ao baixar gradle-wrapper.jar.
        pause
        exit /b 1
    )
    echo [OK] gradle-wrapper.jar baixado
)

REM Build debug APK
echo.
echo [INFO] Compilando APK (debug)...
call "%~dp0gradlew.bat" assembleDebug --no-daemon
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRO] Falha na compilacao.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  APK gerado com sucesso!
echo ============================================
echo.
echo  Arquivo: %~dp0app\build\outputs\apk\debug\app-debug.apk
echo.
echo  Para instalar na TV via ADB:
echo    adb install "%~dp0app\build\outputs\apk\debug\app-debug.apk"
echo.
echo  Ou copie o APK para um pendrive e instale
echo  manualmente na TV.
echo.
pause
