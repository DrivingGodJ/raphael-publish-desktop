#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef Bootstrapper
  #error Bootstrapper is required
#endif

[Setup]
AppId={{75F379E8-BE84-483E-9220-E7E28D836AA1}
AppName=Raphael Publish WinUI
AppVersion={#AppVersion}
AppPublisher=DrivingGodJ and Raphael Publish contributors
AppPublisherURL=https://github.com/DrivingGodJ/raphael-publish-desktop
AppSupportURL=https://github.com/DrivingGodJ/raphael-publish-desktop/issues
DefaultDirName={localappdata}\Programs\Raphael Publish WinUI
DefaultGroupName=Raphael Publish WinUI
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
DisableProgramGroupPage=yes
LicenseFile={#SourceDir}\LICENSE
SetupIconFile={#SourceDir}\icon.ico
UninstallDisplayIcon={app}\Raphael Publish WinUI.exe
OutputDir={#OutputDir}
OutputBaseFilename=Raphael-Publish-WinUI-{#AppVersion}-windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern dynamic
CloseApplications=yes
RestartApplications=no
Uninstallable=yes
AppMutex=Local\Raphael.Publish.WinUI

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimp"; MessagesFile: "compiler:Default.isl,ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Bootstrapper}"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\Raphael Publish WinUI"; Filename: "{app}\Raphael Publish WinUI.exe"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\Raphael Publish WinUI"; Filename: "{app}\Raphael Publish WinUI.exe"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\Raphael Publish WinUI.exe"; Description: "{cm:LaunchProgram,Raphael Publish WinUI}"; Flags: nowait postinstall skipifsilent unchecked

[Code]
function HasWebView2: Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := (RegQueryStringValue(HKLM32, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
            (RegQueryStringValue(HKCU, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if not HasWebView2 then begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
      Result := 'Unable to start Microsoft WebView2 installer. Please install WebView2 Runtime from Microsoft and retry.';
      exit;
    end;
    if not HasWebView2 then
      Result := 'Microsoft WebView2 Runtime installation failed. Check your internet connection or install WebView2 Runtime from Microsoft, then retry.';
  end;
end;

// The installer owns only {app} and shortcuts. Articles, images, settings and
// credentials are outside it and are deliberately never deleted on uninstall.
