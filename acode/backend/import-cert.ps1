param (
    [string]$HostName = "us.ast.checkmarx.net",
    [int]$Port = 443,
    [string]$Alias = ""
)

if ([string]::IsNullOrEmpty($Alias)) {
    $Alias = $HostName
}

# 1. Locate Java Home and keytool
$javaHome = $env:JAVA_HOME
if ([string]::IsNullOrEmpty($javaHome)) {
    # Try finding java in PATH
    $javaPath = Get-Command java -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if ($javaPath) {
        $javaBinFolder = Split-Path $javaPath
        $javaHome = Split-Path $javaBinFolder
    }
}

if (-not $javaHome -or -not (Test-Path $javaHome)) {
    Write-Error "JAVA_HOME environment variable is not set and java was not found in PATH."
    Write-Host "Please set your JAVA_HOME or run this script from a shell that has java configured." -ForegroundColor Red
    Pause
    exit
}

# 2. Locate the 'cacerts' trust store file
$cacertsPaths = @(
    Join-Path $javaHome "lib\security\cacerts",
    Join-Path $javaHome "jre\lib\security\cacerts"
)

$cacertsPath = $null
foreach ($path in $cacertsPaths) {
    if (Test-Path $path) {
        $cacertsPath = $path
        break;
    }
}

if (-not $cacertsPath) {
    Write-Error "Could not find 'cacerts' file under $javaHome."
    Pause
    exit
}

# 3. Check if user already has write access to the keystore file (important for user-installed Java)
$hasWriteAccess = $false
try {
    $stream = [System.IO.File]::OpenWrite($cacertsPath)
    $stream.Close()
    $hasWriteAccess = $true
} catch {
    $hasWriteAccess = $false
}

# 4. Elevate to Administrator ONLY if write access is denied
if (-not $hasWriteAccess) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "Write access to Java truststore ($cacertsPath) was denied." -ForegroundColor Yellow
        Write-Host "Attempting to restart with Administrator privileges..." -ForegroundColor Cyan
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -HostName `"$HostName`" -Port $Port -Alias `"$Alias`"" -Verb RunAs
        exit
    }
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       JAVA KEYSTORE SSL IMPORT TOOL" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Target Host: $HostName" -ForegroundColor Gray
Write-Host "Target Port: $Port" -ForegroundColor Gray
Write-Host "Keystore Alias: $Alias" -ForegroundColor Gray
Write-Host "--------------------------------------------------------" -ForegroundColor Gray

Write-Host "Found Java Home: $javaHome" -ForegroundColor Green
Write-Host "Found Java Keystore: $cacertsPath" -ForegroundColor Green

# 5. Find keytool executable
$keytoolPath = Join-Path $javaHome "bin\keytool.exe"
if (-not (Test-Path $keytoolPath)) {
    $keytoolPath = Get-Command keytool -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
}

if (-not $keytoolPath -or -not (Test-Path $keytoolPath)) {
    Write-Error "Could not find keytool executable."
    Pause
    exit
}

# 5. Connect to host and download SSL Certificate
Write-Host "Connecting to $HostName:$Port to download SSL certificate..." -ForegroundColor Cyan
try {
    # Establish SSL Connection
    $tcpClient = New-Object System.Net.Sockets.TcpClient($HostName, $Port)
    $sslStream = New-Object System.Net.Security.SslStream($tcpClient.GetStream(), $true, {
        param($sender, $certificate, $chain, $errors)
        return $true # Accept any certificate during handshake so we can read it
    })
    $sslStream.AuthenticateAsClient($HostName)
    
    # Get remote certificate
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($sslStream.RemoteCertificate)
    $certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    
    $tempCertPath = [System.IO.Path]::GetTempFileName() + ".cer"
    [System.IO.File]::WriteAllBytes($tempCertPath, $certBytes)
    
    Write-Host "Successfully downloaded certificate." -ForegroundColor Green
    Write-Host "Temp Certificate Saved to: $tempCertPath" -ForegroundColor Gray
}
catch {
    Write-Error "Failed to connect or retrieve certificate from $HostName. Details: $_"
    if ($tcpClient) { $tcpClient.Close() }
    Pause
    exit
}

# 6. Import Certificate into KeyStore
Write-Host "Importing certificate into Java Keystore..." -ForegroundColor Cyan

# Remove old alias if exists to prevent duplicate alias conflicts
$null = & $keytoolPath -delete -alias $Alias -keystore $cacertsPath -storepass changeit -noprompt -ErrorAction SilentlyContinue

# Import new certificate
$importCmd = & $keytoolPath -importcert -trustcacerts -keystore $cacertsPath -storepass changeit -alias $Alias -file $tempCertPath -noprompt 2>&1

Write-Host $importCmd

# 7. Check for success
if ($importCmd -like "*Certificate was added to keystore*") {
    Write-Host "--------------------------------------------------------" -ForegroundColor Gray
    Write-Host "SUCCESS: Certificate successfully added to Java Keystore!" -ForegroundColor Green
    Write-Host "Alias: $Alias" -ForegroundColor Green
} else {
    Write-Host "--------------------------------------------------------" -ForegroundColor Gray
    Write-Host "WARNING: Import output did not confirm success. Check output above." -ForegroundColor Yellow
}

# Clean up temp file
if (Test-Path $tempCertPath) {
    Remove-Item $tempCertPath -Force
}

if ($tcpClient) {
    $tcpClient.Close()
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Process Complete. Press any key to exit..." -ForegroundColor Cyan
Pause
