# src/main/scripts/install-ocr-lang.ps1

param(
    [string]$Language = 'en-US'
)

$capabilityName = "Language.OCR~~~$Language~~~0.0.1.0"

# Intentar ejecutar el comando de instalación en un proceso elevado
try {
    # Lanzamos una nueva instancia de PS como Admin que hace el trabajo
    $proc = Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Add-WindowsCapability -Online -Name '$capabilityName' `"" -Verb RunAs -Wait -PassThru
    
    if ($proc.ExitCode -eq 0) {
        Write-Output '{"success":true}'
    } else {
        Write-Output '{"success":false,"error":"ExitCode ' + $proc.ExitCode + '"}'
    }
} catch {
    # Si el usuario cancela el UAC, entrará aquí
    Write-Output '{"success":false,"error":"UAC_CANCELLED"}'
}
exit 0