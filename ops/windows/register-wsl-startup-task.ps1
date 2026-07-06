$TaskName = "PaidPolitelyCrawlerWSL"
$Distro = $env:WSL_DISTRO_NAME

if ([string]::IsNullOrWhiteSpace($Distro)) {
  $Distro = Read-Host "Enter your WSL distro name, for example Ubuntu-22.04"
}

$Action = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d `"$Distro`" -- systemctl start openai-crawler cloudflared"
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force

Write-Host "Registered scheduled task: $TaskName"
Write-Host "It will start WSL distro '$Distro' and start openai-crawler + cloudflared when you log in."
