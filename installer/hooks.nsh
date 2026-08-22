!include "FileFunc.nsh"

!macro NSIS_HOOK_POSTINSTALL
  ; The downloaded/installer filename encodes the tenant, e.g.
  ; "TRACE-Setup-benedict.exe" -> tenant = "benedict".
  ; If the filename doesn't match that pattern, we just write an empty
  ; tenant.txt and the app falls back to asking the user once.
  ${GetFileName} "$EXEPATH" $1
  StrCpy $2 $1 -4
  StrCpy $3 $2 "" 12

  CreateDirectory "$APPDATA\uz.trace-os.app"
  FileOpen $4 "$APPDATA\uz.trace-os.app\tenant.txt" w
  FileWrite $4 "$3"
  FileClose $4
!macroend
