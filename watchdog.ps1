param(
    [int]$IntervalSeconds = 30,
    [string]$AppDir = ""
)

if ($AppDir -eq "") { $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$LogFile = Join-Path $AppDir "watchdog.log"
$VbsPath = Join-Path $AppDir "start-server.vbs"
$ServerScript = Join-Path $AppDir "server.js"
$HealthUrl = "http://localhost:3000/api/network-info"

function Write-Log {
    param([string]$Message)
    $Time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$Time - $Message" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

Write-Log "Watchdog iniciado (intervalo: ${IntervalSeconds}s)"

while ($true) {
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Log "Servidor OK"
        }
    }
    catch {
        Write-Log "Servidor offline! Reiniciando..."

        # Kill any stale node processes
        Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2

        # Start server
        if (Test-Path $VbsPath) {
            Start-Process wscript.exe -ArgumentList "`"$VbsPath`"" -WindowStyle Hidden
            Write-Log "Servidor reiniciado via VBS"
        }
        elseif (Test-Path $ServerScript) {
            Start-Process node -ArgumentList "`"$ServerScript`"" -WorkingDirectory $AppDir -WindowStyle Hidden
            Write-Log "Servidor reiniciado via node direto"
        }
        else {
            Write-Log "ERRO: server.js nao encontrado em $AppDir"
        }

        Start-Sleep -Seconds 10
    }

    Start-Sleep -Seconds $IntervalSeconds
}
