$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $repo "release\Raphael-Publish-WinUI-$version-windows-x64-Setup.exe"
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{75F379E8-BE84-483E-9220-E7E28D836AA1}_is1'
if (Test-Path -LiteralPath $key) { throw 'WinUI is already installed. Use a clean test account/runner for installer validation.' }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('raphael-installer-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$installation = Join-Path $testRoot 'app'
$projects = Join-Path $testRoot 'projects'
$resultDirectory = Join-Path $repo 'release\installed-winui-check'
$oldRoot = $env:RAPHAEL_PROJECTS_ROOT
function Run-Setup {
    $process = Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/NOICONS','/TASKS=""',('/DIR="' + $installation + '"') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
}
try {
    Run-Setup
    $env:RAPHAEL_PROJECTS_ROOT = $projects
    $process = Start-Process -FilePath (Join-Path $installation 'Raphael Publish WinUI.exe') -ArgumentList '--self-test','--self-test-output',('"' + $resultDirectory + '"') -WindowStyle Hidden -Wait -PassThru
    $result = Get-Content -LiteralPath (Join-Path $resultDirectory 'result.json') -Raw | ConvertFrom-Json
    if ($process.ExitCode -ne 0 -or -not $result.success) { throw 'Installed app self-test failed.' }
    $article = Get-ChildItem -LiteralPath $projects -Filter '正文.md' -Recurse -File | Select-Object -First 1
    if (-not $article) { throw 'Test article missing.' }
    $before = (Get-FileHash -LiteralPath $article.FullName).Hash
    Run-Setup
    if ((Get-FileHash -LiteralPath $article.FullName).Hash -ne $before) { throw 'Upgrade modified the article.' }
    $uninstall = Start-Process -FilePath (Join-Path $installation 'unins000.exe') -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -WindowStyle Hidden -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw 'Uninstall failed.' }
    if (-not (Test-Path -LiteralPath $article.FullName) -or (Get-FileHash -LiteralPath $article.FullName).Hash -ne $before) { throw 'Uninstall removed or modified the article.' }
    if (Test-Path -LiteralPath (Join-Path $installation 'Raphael Publish WinUI.exe')) { throw 'Uninstall left the app executable behind.' }
    if (Test-Path -LiteralPath $key) { throw 'Uninstall registry entry was not cleaned.' }
    Write-Output 'PASS: per-user install, installed native app, upgrade retains article, uninstall retains article.'
    # Only the explicitly created test fixture under the temp directory is deleted.
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^raphael-installer-check-[a-f0-9]{32}$') { throw 'Unsafe test cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
finally { $env:RAPHAEL_PROJECTS_ROOT = $oldRoot }
