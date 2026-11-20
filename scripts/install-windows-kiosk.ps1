<#
.SYNOPSIS
  Crown Canvas Enterprise — Turnkey Windows 10/11 Mini-PC Kiosk Provisioner.

.DESCRIPTION
  Configures a dedicated Chrome kiosk profile (preserving localStorage pairing token
  and Cache Storage offline videos across reboots), disables Windows sleep/monitor timeout,
  and registers a Windows Scheduled Task watchdog that launches Crown Canvas on boot
  and restarts the player if Chrome is ever closed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-windows-kiosk.ps1 -PlayerUrl "https://crown-canvas.vercel.app/player"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$PlayerUrl,

  [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [string]$ProfileDir = "C:\ProgramData\CrownCanvasKiosk\ChromeProfile"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ChromePath)) {
  $altPath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  if (Test-Path $altPath) {
    $ChromePath = $altPath
  } else {
    throw "Google Chrome not found at $ChromePath. Install Chrome first."
  }
}

Write-Host "[1/4] Creating persistent kiosk profile at $ProfileDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

Write-Host "[2/4] Disabling display sleep and standby power timeouts ..." -ForegroundColor Cyan
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null

$launcherDir = "C:\ProgramData\CrownCanvasKiosk"
$launcherScript = Join-Path $launcherDir "launch-player.ps1"

@"
`$chrome = "$ChromePath"
`$argsList = @(
  "--kiosk",
  "$PlayerUrl",
  "--user-data-dir=$ProfileDir",
  "--autoplay-policy=no-user-gesture-required",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-infobars",
  "--disable-session-crashed-bubble",
  "--disable-features=TranslateUI",
  "--overscroll-history-navigation=0"
)

while (`$true) {
  `$proc = Start-Process -FilePath `$chrome -ArgumentList `$argsList -PassThru
  `$proc.WaitForExit()
  Start-Sleep -Seconds 5
}
"@ | Set-Content -Path $launcherScript -Encoding UTF8

Write-Host "[3/4] Registering CrownCanvasKiosk auto-start Scheduled Task ..." -ForegroundColor Cyan
$taskName = "CrownCanvasKioskPlayer"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "[4/4] Starting Crown Canvas Kiosk Player now ..." -ForegroundColor Green
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Crown Canvas Kiosk provisioned successfully!" -ForegroundColor Green
Write-Host " - Pairing token & offline videos persist in: $ProfileDir"
Write-Host " - Wait for the 6-digit PIN on TV, then claim it in CMS -> Fleet & Pairing."
