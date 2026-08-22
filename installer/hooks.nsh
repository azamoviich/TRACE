!include "FileFunc.nsh"

!macro NSIS_HOOK_POSTINSTALL
  ; The downloaded/installer filename encodes the tenant, e.g.
  ; "TRACE-Setup-benedict.exe" -> tenant = "benedict".
  ; Browsers append " (1)", " (2)", etc. on repeat downloads, so we only
  ; keep leading alphanumeric/hyphen characters and stop at the first
  ; anything-else (space, parenthesis, ...). If the filename doesn't
  ; match the expected prefix at all, this yields an empty tenant and
  ; the app falls back to asking the user once.
  ${GetFileName} "$EXEPATH" $1
  StrCpy $2 $1 -4
  StrCpy $3 $2 "" 12

  StrCpy $4 ""
  StrCpy $5 0
  scanloop:
    StrCpy $6 $3 1 $5
    StrCmp $6 "" scandone
    StrCmp $6 " " scandone
    StrCmp $6 "(" scandone
    StrCpy $4 "$4$6"
    IntOp $5 $5 + 1
    Goto scanloop
  scandone:

  CreateDirectory "$APPDATA\uz.trace-os.app"
  FileOpen $7 "$APPDATA\uz.trace-os.app\tenant.txt" w
  FileWrite $7 "$4"
  FileClose $7

  CreateShortCut "$DESKTOP\TRACE.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
