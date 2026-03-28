# src/main/scripts/windows-ocr.ps1
param(
  [string]$ImagePath,
  [string]$Language = 'en-US'
)

# 1. Carga de tipos crítica (solo lo estrictamente necesario para el OCR)
try {
    # ESTA ES LA LÍNEA MÁGICA QUE FALTABA
    Add-Type -AssemblyName "System.Runtime.WindowsRuntime"
    
    $null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
} catch {
    Write-Output '{"error":"Error al proyectar tipos WinRT. Verifica tu versión de Windows."}'
    exit 1
}

# Función Helper para manejar tareas asíncronas
function Await {
  param([object]$WinRtTask, [type]$ResultType)
  $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods().Where({
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  $task = $asTaskMethod.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

try {
    $engine = $null
    
    # Intentar con el idioma solicitado
    if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($Language)) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language($Language)))
    }

    # FALLBACK 1: Usar el idioma actual del sistema (Vía .NET/PS estándar, no WinRT)
    if ($null -eq $engine) {
        $sysLangTag = (Get-Culture).Name
        if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($sysLangTag)) {
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language($sysLangTag)))
        }
    }

    # FALLBACK 2: Usar el primer idioma de OCR que Windows tenga instalado
    if ($null -eq $engine -and [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages.Count -gt 0) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages[0])
    }

    if ($null -eq $engine) {
        throw "No se encontró ningún motor de OCR compatible instalado en Windows."
    }

    # Resolver path absoluto (PowerShell lo necesita para GetFileFromPathAsync)
    $absPath = (Resolve-Path -LiteralPath $ImagePath).ProviderPath
    if (-not [System.IO.File]::Exists($absPath)) {
        Write-Output ('{"error":"File not found: ' + $absPath + '"}')
        exit 1
    }

    # Cargar imagen y ejecutar OCR
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($absPath)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    # Serializar resultado a JSON
    $lines = $result.Lines | ForEach-Object {
        $lineText = $_.Text
        $words = $_.Words | ForEach-Object {
            [ordered]@{
                text = $_.Text
                x    = [math]::Round($_.BoundingRect.X)
                y    = [math]::Round($_.BoundingRect.Y)
                w    = [math]::Round($_.BoundingRect.Width)
                h    = [math]::Round($_.BoundingRect.Height)
            }
        }
        [ordered]@{
            text  = $lineText
            words = @($words)
        }
    }

    $output = [ordered]@{
        success = $true
        lines   = @($lines)
        angle   = $result.TextAngle
    } | ConvertTo-Json -Depth 6 -Compress

    Write-Output $output

} catch {
    # Convertimos las dobles comillas en simples para evitar romper el JSON
    $safeMsg = $_.Exception.Message -replace '"', "'"
    $err = @{ error = $safeMsg }
    Write-Output ($err | ConvertTo-Json -Compress)
    exit 0 # Salimos con 0 para que Node pueda parsear el error en stdout
}