; --- ./resources/installer.nsh

; ── Fuerza instalación en %LOCALAPPDATA%\Programs\ por defecto ──────────────
!macro preInit
  SetShellVarContext current
  ${If} $InstDir == ""
    StrCpy $InstDir "$LOCALAPPDATA\Programs\Courrier-UEX"
  ${EndIf}
!macroend

; ── Elimina la pantalla "instalar para usuario actual / todos los usuarios" ──
; electron-builder llama este macro para mostrar esa página.
; Dejándolo vacío la suprime completamente.
!macro customInstallMode
!macroend

; ── Post-install: instala Tesseract solo si no está presente ─────────────────
!macro customInstall

  ; Chequeamos las 3 ubicaciones posibles donde Tesseract registra su instalación:
  ;   HKLM 64-bit, HKLM 32-bit (WOW6432Node), y HKCU (instalaciones per-user)

  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Tesseract-OCR" "Install_Dir"
  ${If} $0 != ""
    DetailPrint "Tesseract ya instalado (HKLM): $0 — omitiendo."
    Goto TesseractDone
  ${EndIf}

  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Tesseract-OCR" "Install_Dir"
  ${If} $0 != ""
    DetailPrint "Tesseract ya instalado (HKLM WOW64): $0 — omitiendo."
    Goto TesseractDone
  ${EndIf}

  ClearErrors
  ReadRegStr $0 HKCU "SOFTWARE\Tesseract-OCR" "Install_Dir"
  ${If} $0 != ""
    DetailPrint "Tesseract ya instalado (HKCU): $0 — omitiendo."
    Goto TesseractDone
  ${EndIf}

  ; ── No encontrado en ningún registro → instalar silenciosamente ──
  DetailPrint "Tesseract no encontrado — instalando en modo silencioso..."

  StrCpy $1 "$INSTDIR\resources\tesseract-installer.exe"

  ${If} ${FileExists} "$1"
    ExecWait '"$1" /S' $2
    DetailPrint "Tesseract installer finalizado con código: $2"
  ${Else}
    DetailPrint "ADVERTENCIA: No se encontró $1 — omitiendo instalación de Tesseract."
  ${EndIf}

  TesseractDone:

!macroend
