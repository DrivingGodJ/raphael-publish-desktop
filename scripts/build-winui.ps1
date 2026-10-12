param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $dotnet) { $dotnet = Join-Path $env:LOCALAPPDATA 'Programs\dotnet\dotnet.exe' }
if (-not (Test-Path -LiteralPath $dotnet)) { throw '请安装 .NET 10 SDK 后再构建。' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repo 'release\winui-v2.0.0' }
pnpm exec vite build --config vite.winui.config.ts
if ($LASTEXITCODE -ne 0) { throw '排版引擎构建失败。' }
pnpm icon:build
if ($LASTEXITCODE -ne 0) { throw '应用图标生成失败。' }
& $dotnet publish native\WinUI\Raphael.WinUI.csproj -c Release -r win-x64 --self-contained true -o $OutputDirectory -v minimal
if ($LASTEXITCODE -ne 0) { throw 'WinUI 程序构建失败。' }
foreach ($oldAsset in (Get-ChildItem -LiteralPath (Join-Path $OutputDirectory 'Web\assets') -File -ErrorAction SilentlyContinue)) {
    if ($oldAsset.Name -match '^index-.+\.(js|css)$' -and -not (Test-Path -LiteralPath (Join-Path (Join-Path $repo 'native\WinUI\Web\assets') $oldAsset.Name))) {
        Remove-Item -LiteralPath $oldAsset.FullName
    }
}
Copy-Item -LiteralPath (Join-Path $repo 'native\README.md') -Destination (Join-Path $OutputDirectory '使用说明.md')
$assets = Get-Content -LiteralPath (Join-Path $repo 'native\WinUI\obj\project.assets.json') -Raw | ConvertFrom-Json
$packageRoot = $assets.packageFolders.PSObject.Properties.Name | Select-Object -First 1
foreach ($library in $assets.libraries.PSObject.Properties) {
    if ($library.Value.type -ne 'package') { continue }
    $packageDirectory = Join-Path $packageRoot $library.Value.path
    if (-not (Test-Path -LiteralPath $packageDirectory)) { continue }
    foreach ($notice in (Get-ChildItem -LiteralPath $packageDirectory -Recurse -File | Where-Object { $_.Name -match 'license|notice|copying' })) {
        $relative = $notice.FullName.Substring($packageDirectory.Length).TrimStart('\','/')
        $destination = Join-Path (Join-Path $OutputDirectory ('ThirdPartyLicenses\' + $library.Value.path.Replace('/','-'))) $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $notice.FullName -Destination $destination
    }
}
Write-Output "WinUI 程序：$OutputDirectory"
