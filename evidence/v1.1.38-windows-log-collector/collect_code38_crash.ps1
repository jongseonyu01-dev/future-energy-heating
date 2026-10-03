<#
Code 38 review APK crash collector for Windows.
It does not install, uninstall, modify, clear, or publish the app. It only reads device logs.
#>

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Section([string]$Message) {
  Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Find-Adb {
  $candidates = @(
    (Join-Path $PSScriptRoot "platform-tools\adb.exe"),
    "C:\platform-tools\adb.exe",
    (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe")
  )

  $command = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

function Stop-Collector([System.Diagnostics.Process]$Process) {
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 700
  }
}

function Write-CaptureFile([string]$Status, [string]$Reason, [string]$OutputPath, [string]$LivePath, [string]$ErrorPath, [string]$Serial) {
  $header = @(
    "Future Energy Tech code 38 crash capture",
    "captureStatus=$Status",
    "capturedAt=$((Get-Date).ToString('o'))",
    "device=$Serial",
    "package=com.futureenergy.heatingcare",
    "reason=$Reason",
    "filters=AndroidRuntime, ReactNativeJS, ReactNative, Expo, ExpoModulesCore, libc, DEBUG, ActivityManager",
    "",
    "--- LOGCAT ---"
  )
  Set-Content -Path $OutputPath -Value $header -Encoding UTF8
  if (Test-Path $LivePath) {
    Get-Content -Path $LivePath -Encoding UTF8 | Add-Content -Path $OutputPath -Encoding UTF8
  }
  if (Test-Path $ErrorPath) {
    Add-Content -Path $OutputPath -Value "`n--- ADB STDERR ---" -Encoding UTF8
    Get-Content -Path $ErrorPath -Encoding UTF8 | Add-Content -Path $OutputPath -Encoding UTF8
  }
}

function Remove-TemporaryCaptureFiles([string]$LivePath, [string]$ErrorPath) {
  Remove-Item $LivePath, $ErrorPath -Force -ErrorAction SilentlyContinue
}

function Get-AdbDeviceState([string]$AdbPath, [string]$Serial) {
  $result = [ordered]@{
    succeeded = $false
    state = ""
    exitCode = $null
    output = ""
    reason = ""
  }

  try {
    $response = @(& $AdbPath -s $Serial get-state 2>&1)
    $result.exitCode = $LASTEXITCODE
    $result.output = (($response | ForEach-Object { "$($_)" }) -join " | ").Trim()
  } catch {
    $result.reason = "adb get-state 예외: $($_.Exception.Message)"
    return [PSCustomObject]$result
  }

  if ($result.exitCode -ne 0) {
    $result.reason = "adb get-state 비정상 종료: exitCode=$($result.exitCode), output=$($result.output)"
    return [PSCustomObject]$result
  }
  if ([string]::IsNullOrWhiteSpace($result.output)) {
    $result.reason = "adb get-state 빈 응답"
    return [PSCustomObject]$result
  }

  $result.state = $result.output
  $result.succeeded = $true
  return [PSCustomObject]$result
}

function Finish-FailedCapture([string]$Reason, [int]$ExitCode) {
  Write-CaptureFile "failed" $Reason $output $liveOutput $stderrOutput $target.Serial
  Remove-TemporaryCaptureFiles $liveOutput $stderrOutput
  Write-Host "수집 실패: $Reason" -ForegroundColor Red
  Write-Host "분석을 위해 생성된 파일을 보내 주세요: $output" -ForegroundColor Yellow
  exit $ExitCode
}

Write-Section "code 38 종료 로그 수집"
$adb = Find-Adb
if (-not $adb) {
  Write-Host "공식 Android SDK Platform Tools의 adb.exe를 찾지 못했습니다." -ForegroundColor Yellow
  Write-Host "1) https://developer.android.com/tools/releases/platform-tools 에서 Windows용 ZIP을 받습니다."
  Write-Host "2) 압축을 풀어 생긴 platform-tools 폴더를 이 도구와 같은 폴더에 둡니다."
  Write-Host "3) 휴대폰을 연결한 뒤 이 파일을 다시 실행합니다."
  Read-Host "확인하려면 Enter"
  exit 2
}

Write-Host "adb: $adb"
& $adb start-server | Out-Null
$deviceLines = @(& $adb devices -l 2>&1)
$devices = @()
foreach ($line in $deviceLines) {
  if ("$line" -match "^(?<serial>\S+)\s+(?<state>device|unauthorized|offline)\b") {
    $devices += [PSCustomObject]@{ Serial = $Matches.serial; State = $Matches.state; Detail = "$line" }
  }
}

if ($devices.Count -eq 0) {
  Write-Host "연결된 Android 기기가 없습니다." -ForegroundColor Yellow
  Write-Host "필요한 조치: USB 케이블을 데이터 전송 가능 케이블로 다시 연결하고, 휴대폰에서 개발자 옵션 > USB 디버깅을 켭니다."
  Write-Host "그 다음 잠금 해제 상태에서 이 도구를 다시 실행합니다."
  Read-Host "확인하려면 Enter"
  exit 3
}

$unauthorized = @($devices | Where-Object { $_.State -eq "unauthorized" })
if ($unauthorized.Count -gt 0) {
  Write-Host "USB 디버깅 승인이 필요합니다:" -ForegroundColor Yellow
  $unauthorized | ForEach-Object { Write-Host "  $($_.Detail)" }
  Write-Host "휴대폰 잠금을 풀고 '이 컴퓨터의 RSA 키를 허용'을 선택한 뒤 이 도구를 다시 실행합니다."
  Read-Host "확인하려면 Enter"
  exit 4
}

$offline = @($devices | Where-Object { $_.State -eq "offline" })
if ($offline.Count -gt 0) {
  Write-Host "기기가 offline 상태입니다:" -ForegroundColor Yellow
  $offline | ForEach-Object { Write-Host "  $($_.Detail)" }
  Write-Host "케이블을 다시 연결하고 휴대폰 잠금을 푼 뒤 이 도구를 다시 실행합니다."
  Read-Host "확인하려면 Enter"
  exit 5
}

$ready = @($devices | Where-Object { $_.State -eq "device" })
if ($ready.Count -gt 1) {
  Write-Host "여러 기기가 연결되어 있습니다:" -ForegroundColor Yellow
  for ($i = 0; $i -lt $ready.Count; $i++) { Write-Host "[$($i + 1)] $($ready[$i].Detail)" }
  $selection = Read-Host "검수할 휴대폰 번호 입력"
  $index = 0
  if (-not [int]::TryParse($selection, [ref]$index) -or $index -lt 1 -or $index -gt $ready.Count) {
    Write-Host "올바른 번호를 입력하지 않아 종료합니다." -ForegroundColor Yellow
    exit 6
  }
  $target = $ready[$index - 1]
} else {
  $target = $ready[0]
}

$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
if (-not $desktop -or -not (Test-Path $desktop)) { $desktop = $PSScriptRoot }
$output = Join-Path $desktop "code38-crash.txt"
$liveOutput = Join-Path $desktop "code38-crash-live.tmp"
$stderrOutput = Join-Path $desktop "code38-crash-adb-stderr.tmp"
Remove-Item $liveOutput, $stderrOutput -Force -ErrorAction SilentlyContinue

$logcatArgs = @(
  "-s", $target.Serial, "logcat", "-v", "threadtime",
  "AndroidRuntime:E", "ReactNativeJS:V", "ReactNative:V", "Expo:V", "ExpoModulesCore:V",
  "libc:E", "DEBUG:E", "ActivityManager:I", "*:S"
)

try {
  $collector = Start-Process -FilePath $adb -ArgumentList $logcatArgs -RedirectStandardOutput $liveOutput -RedirectStandardError $stderrOutput -NoNewWindow -PassThru
} catch {
  Finish-FailedCapture "adb logcat 시작 실패: $($_.Exception.Message)" 7
}

Start-Sleep -Seconds 1
$collector.Refresh()
if ($collector.HasExited) {
  Finish-FailedCapture "수집 프로세스가 재현 전 조기 종료됨. exitCode=$($collector.ExitCode)" 8
}

Write-Section "수집이 시작되었습니다"
Write-Host "대상: $($target.Serial)"
Write-Host "저장 위치: $output"
Write-Host "지금부터 앱의 전체 작업 목록 또는 점검표 종료를 한 번 재현하세요."
Write-Host "재현 직후 이 창으로 돌아와 Enter를 누르면 수집을 끝냅니다." -ForegroundColor Yellow

Read-Host "종료 현상을 재현한 뒤 Enter"
$collector.Refresh()
if ($collector.HasExited) {
  Finish-FailedCapture "수집 프로세스가 재현 중 조기 종료됨. exitCode=$($collector.ExitCode)" 9
}

Stop-Collector $collector
$stateCheck = Get-AdbDeviceState $adb $target.Serial
if (-not $stateCheck.succeeded) {
  Finish-FailedCapture "수집 종료 뒤 연결 상태 확인 실패: $($stateCheck.reason)" 10
}
if ($stateCheck.state -ne "device") {
  Finish-FailedCapture "수집 종료 뒤 USB 연결 상태가 device가 아님: $($stateCheck.state), output=$($stateCheck.output)" 10
}

$logLines = @()
if (Test-Path $liveOutput) {
  $logLines = @(Get-Content -Path $liveOutput -Encoding UTF8 | Where-Object { $_ -and $_.Trim().Length -gt 0 })
}
if ($logLines.Count -eq 0) {
  Finish-FailedCapture "필터에 맞는 로그가 없어 빈 수집으로 판정" 11
}

Write-CaptureFile "success" "수집 완료" $output $liveOutput $stderrOutput $target.Serial
Remove-TemporaryCaptureFiles $liveOutput $stderrOutput
Write-Section "수집 완료"
Write-Host "파일: $output" -ForegroundColor Green
Write-Host "이 code38-crash.txt 한 파일만 이 채팅에 첨부해 주세요."
Read-Host "확인하려면 Enter"
