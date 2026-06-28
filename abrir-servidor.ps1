$ip = & {
    $gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex
    if ($gw) {
        $ip = (Get-NetIPAddress -InterfaceIndex $gw -AddressFamily IPv4).IPAddress
        if ($ip) { return $ip }
    }
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.PrefixOrigin -ne 'WellKnown' -and !$_.SkipAsSource -and
        $_.InterfaceAlias -notlike '*Loopback*' -and
        $_.InterfaceAlias -notlike '*Hyper-V*' -and
        $_.InterfaceAlias -notlike '*vEthernet*' -and
        $_.InterfaceAlias -notlike '*Virtual*' -and
        $_.InterfaceAlias -notlike '*Bluetooth*'
    }).IPAddress | Select-Object -First 1
    if (-not $ip) {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.PrefixOrigin -ne 'WellKnown' -and !$_.SkipAsSource
        }).IPAddress | Select-Object -First 1
    }
    if ($ip) { return $ip } else { return 'localhost' }
}

$url = "http://${ip}:3000"

Write-Host "============================================"
Write-Host "  SmartTV Media Server instalado!"
Write-Host "============================================"
Write-Host ""
Write-Host "  Acesse na SmartTV:"
Write-Host "  $url"
Write-Host ""
Write-Host "  Ou localmente: http://localhost:3000"
Write-Host "============================================"

# Show message box with the IP
$wshell = New-Object -ComObject Wscript.Shell
$wshell.Popup("SmartTV Media Server instalado!`n`nAcesse na SmartTV:`n  $url`n`nOu localmente em http://localhost:3000", 0, "SmartTV Media Server", 0)

Start-Process $url
