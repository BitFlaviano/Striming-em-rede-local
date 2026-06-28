; SmartTV Media Player - Inno Setup Installer
; Compile: ISCC.exe "setup.iss"

#define MyAppName "SmartTV Media Player"
#define MyAppVersion "1.0"
#define MyAppPublisher "SmartTV Media"
#define MyAppURL "http://localhost:3000"
#define MyAppExeName "iniciar.bat"
#define MyServiceName "SmartTV Media Server"

[Setup]
AppId={{B8F4E5A2-9D3C-4A7E-B1F6-2C8D5E7F3A0B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SmartTV Media
DefaultGroupName=SmartTV Media
DisableProgramGroupPage=yes
OutputDir=.\installer
OutputBaseFilename=SmartTV-Media-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=.\installer\icon.ico
UninstallDisplayIcon={app}\icon.ico

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na &Area de Trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Files]
Source: "server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "network-discovery.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "iniciar.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "start-server.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "install-service.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "watchdog.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "abrir-servidor.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\node_modules"; Permissions: users-modify

[Icons]
Name: "{group}\SmartTV Media Player"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Iniciar Servidor (Segundo Plano)"; Filename: "{app}\start-server.vbs"; WorkingDir: "{app}"
Name: "{group}\Parar Servidor"; Filename: "{app}\iniciar.bat"; Parameters: "stop"; WorkingDir: "{app}"
Name: "{group}\Desinstalar SmartTV Media"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SmartTV Media Player"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{commonstartup}\SmartTV Media Server"; Filename: "{app}\start-server.vbs"; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -AppDir ""{app}"""; Description: "Instalar servico de inicializacao automatica"; Flags: postinstall nowait skipifsilent shellexec runasoriginaluser
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\abrir-servidor.ps1"""; Description: "Abrir SmartTV Media Player no navegador"; Flags: postinstall nowait skipifsilent shellexec runasoriginaluser
Filename: "{app}\{#MyAppExeName}"; Description: "Iniciar SmartTV Media Player (janela)"; Flags: postinstall nowait skipifsilent unchecked shellexec
Filename: "powershell.exe"; Parameters: "-Command ""Start-Process 'https://nodejs.org' -WindowStyle Normal"""; Description: "Instalar Node.js (necessario)"; Flags: postinstall skipifsilent unchecked shellexec runasoriginaluser

[Code]
var
  NodePage: TWizardPage;
  NodeLabel: TNewStaticText;
  FirewallPage: TWizardPage;
  FirewallLabel: TNewStaticText;
  IpLabel: TNewStaticText;
  ServerIp: string;

function GetLocalIP: string;
var
  TmpFile: string;
  ResultCode: Integer;
  Lines: TArrayOfString;
  Line: string;
  i: Integer;
begin
  Result := '127.0.0.1';
  TmpFile := ExpandConstant('{tmp}\smarttv_ip.txt');
  if Exec('powershell.exe', '-Command "& { $gw = (Get-NetRoute -DestinationPrefix ''0.0.0.0/0'' | Sort-Object -Property RouteMetric | Select-Object -First 1).InterfaceIndex; if ($gw) { $ip = (Get-NetIPAddress -InterfaceIndex $gw -AddressFamily IPv4).IPAddress; if ($ip) { $ip; exit } } $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne ''WellKnown'' -and !$_.SkipAsSource -and $_.InterfaceAlias -notlike ''*Loopback*'' -and $_.InterfaceAlias -notlike ''*Hyper-V*'' -and $_.InterfaceAlias -notlike ''*vEthernet*'' -and $_.InterfaceAlias -notlike ''*Virtual*'' -and $_.InterfaceAlias -notlike ''*Bluetooth*'' }).IPAddress | Select-Object -First 1; if (-not $ip) { $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -ne ''WellKnown'' -and !$_.SkipAsSource }).IPAddress | Select-Object -First 1 } if ($ip) { $ip } else { ''127.0.0.1'' } } | Out-File -FilePath ''' + TmpFile + ''' -Encoding ASCII"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      if LoadStringsFromFile(TmpFile, Lines) then
      begin
        for i := 0 to GetArrayLength(Lines) - 1 do
        begin
          Line := Trim(Lines[i]);
          if Line <> '' then
          begin
            Result := Line;
            Break;
          end;
        end;
      end;
    end;
  end;
end;

function IsNodeInstalled: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/c where node >nul 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

procedure CreateFirewallRule;
var
  ResultCode: Integer;
begin
  Exec('netsh', 'advfirewall firewall add rule name="SmartTV-Media" dir=in protocol=tcp localport=3000 action=allow', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure RemoveFirewallRule;
var
  ResultCode: Integer;
begin
  Exec('netsh', 'advfirewall firewall delete rule name="SmartTV-Media"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure RunNpmInstall;
var
  ResultCode: Integer;
begin
  if Exec('cmd.exe', '/c cd /d "' + ExpandConstant('{app}') + '" && npm install --production', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
      Log('npm install concluido com sucesso')
    else
      Log('npm install falhou com codigo ' + IntToStr(ResultCode) + '. Execute manualmente.');
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Msg: string;
begin
  if CurStep = ssPostInstall then
  begin
    CreateFirewallRule;
    if IsNodeInstalled then
      RunNpmInstall;
    ServerIp := GetLocalIP;
    if ServerIp = '127.0.0.1' then
      ServerIp := GetLocalIP;
    Msg := 'Servidor instalado com sucesso!'#13#10 +
           'Acesse na SmartTV pelo endereco:'#13#10#13#10 +
           '   http://' + ServerIp + ':3000'#13#10#13#10 +
           'Ou localmente em http://localhost:3000'#13#10#13#10 +
           'O servidor iniciara automaticamente ao fazer login.';
    MsgBox(Msg, mbInformation, MB_OK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    RemoveFirewallRule;
  end;
end;

procedure InitializeWizard;
begin
  ServerIp := GetLocalIP;

  NodePage := CreateCustomPage(wpSelectTasks, 'Node.js', '');
  NodeLabel := TNewStaticText.Create(NodePage);
  NodeLabel.Parent := NodePage.Surface;
  NodeLabel.WordWrap := True;
  NodeLabel.Left := 0;
  NodeLabel.Top := 0;
  NodeLabel.Width := NodePage.SurfaceWidth;
  NodeLabel.Height := 60;

  if IsNodeInstalled then
    NodeLabel.Caption := 'Node.js detectado no sistema.'#13#10'Continuando instalacao...'
  else
    NodeLabel.Caption := 'Node.js nao encontrado!'#13#10'Apos a instalacao, baixe e instale o Node.js em:'#13#10'https://nodejs.org (versao LTS recomendada)'#13#10#13#10'Depois execute "npm install" na pasta do aplicativo.';

  FirewallPage := CreateCustomPage(wpSelectTasks, 'Firewall', '');
  FirewallLabel := TNewStaticText.Create(FirewallPage);
  FirewallLabel.Parent := FirewallPage.Surface;
  FirewallLabel.WordWrap := True;
  FirewallLabel.Left := 0;
  FirewallLabel.Top := 0;
  FirewallLabel.Width := FirewallPage.SurfaceWidth;
  FirewallLabel.Height := 80;

  IpLabel := TNewStaticText.Create(FirewallPage);
  IpLabel.Parent := FirewallPage.Surface;
  IpLabel.WordWrap := True;
  IpLabel.Left := 0;
  IpLabel.Top := 40;
  IpLabel.Width := FirewallPage.SurfaceWidth;
  IpLabel.Height := 40;
  IpLabel.Font.Style := [fsBold];
  IpLabel.Caption := 'IP detectado: ' + ServerIp + #13#10'Regra de firewall criada para porta 3000.';
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = FirewallPage.ID then
  begin
    ServerIp := GetLocalIP;
    IpLabel.Caption := 'IP detectado: ' + ServerIp + #13#10'Regra de firewall criada para porta 3000.';
  end;
end;
