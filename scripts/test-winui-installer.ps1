$ErrorActionPreference = 'Stop'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{75F379E8-BE84-483E-9220-E7E28D836AA1}_is1'
if (Test-Path -LiteralPath $key) { throw 'WinUI is already installed. Use a clean test account/runner for installer validation.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$setup = (Resolve-Path "release\Raphael-Publish-WinUI-$version-windows-x64-Setup.exe").Path
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('raphael-installer-check-' + [guid]::NewGuid().ToString('N'))
$app = Join-Path $fixture 'app'
$articles = Join-Path $fixture 'articles'
$results = Join-Path $fixture 'results'
New-Item -ItemType Directory -Path $app, $articles, $results | Out-Null
[IO.File]::WriteAllText((Join-Path $app 'DirectML.dll'), 'obsolete upgrade fixture')
[IO.File]::WriteAllText((Join-Path $articles '正文.md'), '# Protected article fixture')
$protectedHash = (Get-FileHash -LiteralPath (Join-Path $articles '正文.md')).Hash
$install = Start-Process -FilePath $setup -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=', ('/DIR="' + $app + '"')) -PassThru -WindowStyle Hidden
if (!$install.WaitForExit(180000)) { $install.Kill(); throw 'Installer timed out.' }
if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
if (Test-Path -LiteralPath (Join-Path $app 'DirectML.dll')) { throw 'Obsolete SDK file survived upgrade.' }
node scripts/test-native-distribution.mjs $app
if ($LASTEXITCODE -ne 0) { throw 'Installed payload check failed.' }
$oldRoot = $env:RAPHAEL_PROJECTS_ROOT
$env:RAPHAEL_PROJECTS_ROOT = Join-Path $fixture 'test-projects'
try {
    $test = Start-Process -FilePath (Join-Path $app 'Raphael Publish WinUI.exe') -ArgumentList @('--self-test', '--no-screenshots', '--self-test-output', ('"' + $results + '"')) -PassThru -WindowStyle Hidden
    if (!$test.WaitForExit(120000)) { $test.Kill(); throw 'Native self-test timed out.' }
    $report = Get-Content -LiteralPath (Join-Path $results 'result.json') -Raw | ConvertFrom-Json
    if (!$report.success) { throw ($report | ConvertTo-Json -Depth 8) }
} finally { $env:RAPHAEL_PROJECTS_ROOT = $oldRoot }
$article = Get-ChildItem -LiteralPath (Join-Path $fixture 'test-projects') -Filter '正文.md' -Recurse -File | Select-Object -First 1
if (!$article) { throw 'Self-test article missing.' }
$articleHash = (Get-FileHash -LiteralPath $article.FullName).Hash
[IO.File]::WriteAllText((Join-Path $app 'DirectML.dll'), 'obsolete SDK upgrade fixture')
$upgrade = Start-Process -FilePath $setup -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/NOICONS', '/TASKS=""', ('/DIR="' + $app + '"')) -PassThru -WindowStyle Hidden
if (!$upgrade.WaitForExit(180000)) { $upgrade.Kill(); throw 'Upgrade timed out.' }
if ($upgrade.ExitCode -ne 0 -or (Test-Path -LiteralPath (Join-Path $app 'DirectML.dll'))) { throw 'Upgrade or obsolete SDK cleanup failed.' }
if ((Get-FileHash -LiteralPath $article.FullName).Hash -ne $articleHash) { throw 'Upgrade modified the article.' }
$uninstall = Start-Process -FilePath (Join-Path $app 'unins000.exe') -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -PassThru -WindowStyle Hidden
if (!$uninstall.WaitForExit(60000) -or $uninstall.ExitCode -ne 0) { throw 'Uninstall failed.' }
if ((Get-FileHash -LiteralPath (Join-Path $articles '正文.md')).Hash -ne $protectedHash) { throw 'Protected article changed.' }
if (!(Test-Path -LiteralPath $article.FullName) -or (Get-FileHash -LiteralPath $article.FullName).Hash -ne $articleHash) { throw 'Uninstall modified the real project fixture.' }
if (Test-Path -LiteralPath (Join-Path $app 'Raphael Publish WinUI.exe')) { throw 'Uninstall left the executable behind.' }
if (Test-Path -LiteralPath $key) { throw 'Uninstall registry entry was not cleaned.' }
Write-Output 'PASS: native installer, obsolete SDK cleanup, functional self-test, uninstall, protected article preservation.'
