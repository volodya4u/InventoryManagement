@echo off
setlocal

set "APP_DIR=%~dp0"
set "APP_JAR=%APP_DIR%target\inventory-0.1.0-SNAPSHOT.jar"
set "APP_URL=http://localhost:8081"
set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"

if not exist "%APP_JAR%" (
    echo OnlineStore could not be started.
    echo The application file was not found:
    echo "%APP_JAR%"
    echo.
    echo Build the project first, then try again.
    pause
    exit /b 1
)

if not exist "%CHROME_EXE%" (
    echo Google Chrome could not be found:
    echo "%CHROME_EXE%"
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "if (-not (Test-NetConnection -ComputerName 'localhost' -Port 8081 -InformationLevel Quiet -WarningAction SilentlyContinue)) { exit 1 } else { exit 0 }"

if errorlevel 1 (
    start "OnlineStore server" cmd.exe /k "cd /d ""%APP_DIR%"" && java -jar ""%APP_JAR%"""
)

echo Waiting for OnlineStore to become available...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$url = '%APP_URL%'; $deadline = (Get-Date).AddMinutes(2); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { Start-Process -FilePath '%CHROME_EXE%' -ArgumentList $url; exit 0 } } catch {}; Start-Sleep -Seconds 1 }; Write-Host 'OnlineStore did not become available within two minutes.' -ForegroundColor Red; exit 1"

if errorlevel 1 (
    echo.
    echo Check the "OnlineStore server" window for an error message.
    pause
    exit /b 1
)

endlocal
