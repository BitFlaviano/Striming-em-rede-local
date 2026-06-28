; SmartTV Media Player - Inno Setup Installer
; Compile: ISCC.exe "setup.iss"

#define MyAppName "SmartTV Media Player"
#define MyAppVersion "1.0"
#define MyAppPublisher "SmartTV Media"
#define MyAppURL "http://192.168.0.196:3000"
#define MyAppExeName "iniciar.bat"

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
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\node_modules"; Permissions: users-modify

[Icons]
Name: "{group}\SmartTV Media Player"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Desinstalar SmartTV Media"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SmartTV Media Player"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Iniciar SmartTV Media Player"; Flags: postinstall nowait skipifsilent shellexec
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
  Result := '192.168.0.196';
  TmpFile := ExpandConstant('{tmp}\smarttv_ip.txt');
  if Exec('powershell.exe', '-Command "& { $ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex (Get-NetConnectionProfile).InterfaceIndex | Where-Object { $_.PrefixOrigin -ne ''WellKnown'' -and $_.IPAddress -like ''192.168.*'' }).IPAddress | Select-Object -First 1; if ($ip) { $ip } else { ''192.168.0.196'' } } | Out-File -FilePath ''' + TmpFile + ''' -Encoding ASCII"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
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

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    CreateFirewallRule;
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
