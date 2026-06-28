param(
    [string]$AppDir = "",
    [switch]$Uninstall = $false
)

if ($AppDir -eq "") { $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

$TaskName = "SmartTV Media Server"
$VbsPath = Join-Path $AppDir "start-server.vbs"
$BatPath = Join-Path $AppDir "iniciar.bat"

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarefa removida: $TaskName"
    exit 0
}

# Check prerequisites
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: Node.js nao encontrado! Instale em https://nodejs.org" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $VbsPath)) {
    Write-Host "ERRO: $VbsPath nao encontrado" -ForegroundColor Red
    exit 1
}

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Create scheduled task that runs at logon, restarts on failure
$Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$VbsPath`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId "INTERACTIVE" -LogonType Interactive -RunLevel Limited
$Task = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "SmartTV Media Server - reproduz midia da rede local"

if ($Task) {
    Write-Host "OK: Tarefa '$TaskName' criada com sucesso!" -ForegroundColor Green
    Write-Host "    O servidor iniciara automaticamente ao fazer login."
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "    Servidor iniciado agora."
} else {
    Write-Host "ERRO: Falha ao criar tarefa" -ForegroundColor Red
    exit 1
}
