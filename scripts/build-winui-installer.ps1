param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$source = Join-Path $repo "release\winui-v$version"
if (-not $SkipBuild) { & (Join-Path $PSScriptRoot 'build-winui.ps1') -OutputDirectory $source }
if (-not (Test-Path -LiteralPath (Join-Path $source 'Raphael Publish WinUI.exe'))) { throw 'WinUI publish directory is missing.' }
$compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $compiler) {
    foreach ($candidate in @((Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'), 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe')) {
        if (Test-Path -LiteralPath $candidate) { $compiler = $candidate; break }
    }
}
if (-not $compiler) { throw '请先安装 Inno Setup 6.7 或更新版本。' }
$dependencies = Join-Path $repo 'release\installer-dependencies'
New-Item -ItemType Directory -Path $dependencies -Force | Out-Null
$bootstrapper = Join-Path $dependencies 'MicrosoftEdgeWebview2Setup.exe'
if (-not (Test-Path -LiteralPath $bootstrapper)) { Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper }
$signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'Microsoft WebView2 bootstrapper signature verification failed.' }
& $compiler "/DAppVersion=$version" "/DSourceDir=$source" "/DOutputDir=$(Join-Path $repo 'release')" "/DBootstrapper=$bootstrapper" installer\winui.iss
if ($LASTEXITCODE -ne 0) { throw 'WinUI 安装包构建失败。' }
