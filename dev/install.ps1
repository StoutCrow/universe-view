# Type-checks, tests, builds and copies the plugin into your vaults (keeping each vault's data.json).
# Usage: powershell -File dev/install.ps1 [-Version 0.26.1]
# The vaults are listed one per line in dev/vaults.local.txt (kept out of git); without it, only
# example-vault. -Version also updates manifest.json, package.json and versions.json.
param([string]$Version)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)
# A Node.js that isn't on the PATH can be named in UV_NODE_BIN (the folder holding node.exe).
if ($env:UV_NODE_BIN) { $env:PATH = $env:UV_NODE_BIN + ";" + $env:PATH }
elseif (Test-Path "$env:USERPROFILE\.chronicle-node\package\bin") { $env:PATH = "$env:USERPROFILE\.chronicle-node\package\bin;" + $env:PATH }
$enc = New-Object System.Text.UTF8Encoding($false)
if ($Version) {
	# package.json's own version (the first "version", never the script of that name)…
	$t = [IO.File]::ReadAllText("package.json")
	$t = ([regex]'"version": "[^"]+"').Replace($t, "`"version`": `"$Version`"", 1)
	[IO.File]::WriteAllText("package.json", $t, $enc)
	# …then manifest.json and versions.json, the same way `npm version` does.
	$env:npm_package_version = $Version
	node version-bump.mjs
	if ($LASTEXITCODE) { throw "Couldn't update the version" }
}
node node_modules\typescript\bin\tsc -noEmit -skipLibCheck
if ($LASTEXITCODE) { throw "Type errors" }
node dev/build-tests.mjs
node dev/out/tests.js | Select-Object -Last 1
if ($LASTEXITCODE) { throw "Tests failed" }
node esbuild.config.mjs production
if ($LASTEXITCODE) { throw "Build failed" }
$list = "dev\vaults.local.txt"
$vaults = if (Test-Path $list) { Get-Content $list | Where-Object { $_.Trim() -and -not $_.StartsWith("#") } } else { @("example-vault") }
foreach ($v in $vaults) {
	$d = Join-Path $v.Trim() ".obsidian\plugins\universe-view"
	if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }
	Copy-Item main.js, manifest.json, styles.css $d -Force
	$bom = [IO.File]::ReadAllBytes("$d\manifest.json")[0]
	$ver = (Get-Content "$d\manifest.json" -Raw | ConvertFrom-Json).version
	"{0}: v{1}, first byte {2}, data.json {3}" -f (Split-Path $v.Trim() -Leaf), $ver, $bom, (Test-Path "$d\data.json")
}
