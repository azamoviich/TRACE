!include "FileFunc.nsh"

!macro NSIS_HOOK_POSTINSTALL
  ; The downloaded/installer filename encodes the tenant, e.g.
  ; "TRACE-Setup-benedict.exe" -> tenant = "benedict".
  ; Browsers append " (1)", " (2)", etc. on repeat downloads, so we only
  ; keep leading alphanumeric/hyphen characters and stop at the first
  ; anything-else (space, parenthesis, ...). Anything not actually
  ; prefixed "TRACE-Setup-" (a generically-named build, e.g. Tauri's own
  ; default "TRACE_0.1.0_x64-setup.exe") is left alone entirely — no
  ; tenant.txt is written, so the app falls back to asking the user once,
  ; instead of parsing garbage out of an unrelated filename.
  ${GetFileName} "$EXEPATH" $1
  StrCpy $8 $1 12
  StrCmp $8 "TRACE-Setup-" 0 skip_tenant

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
  skip_tenant:

  CreateShortCut "$DESKTOP\TRACE.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
