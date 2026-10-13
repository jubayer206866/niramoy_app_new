$os = Get-CimInstance Win32_OperatingSystem
$freeGB = [math]::Round($os.FreePhysicalMemory * 1KB / 1GB, 1)
$totalGB = [math]::Round($os.TotalVisibleMemorySize * 1KB / 1GB, 1)
"MEMORY: $freeGB GB free / $totalGB GB total"
"Now: $(Get-Date)"
""
"NODE PROCESSES:"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  $mb = [math]::Round($_.WorkingSetSize / 1MB)
  $c = $_.CommandLine
  if ($null -ne $c -and $c.Length -gt 95) { $c = $c.Substring(0, 95) }
  "  PID {0,-7} {1,6} MB  start={2:HH:mm:ss}  {3}" -f $_.ProcessId, $mb, $_.CreationDate, $c
}
""
"TOP MEMORY CONSUMERS:"
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 8 | ForEach-Object {
  "  {0,-22} {1,6} MB  PID {2}" -f $_.ProcessName, [math]::Round($_.WorkingSet64 / 1MB), $_.Id
}
""
"PORT 3000 / 4000 LISTENERS:"
netstat -ano | Select-String "LISTENING" | Select-String ":3000|:4000"
