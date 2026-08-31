$scriptPath = "c:\Users\WD\Desktop\작업용\ju\골드랩 작업\scripts\run-sync-silent.vbs"

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At "10:15"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "10:15" -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Hours 7)).Repetition

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "GoldLab_KGE_AutoSync" -Action $action -Trigger $trigger -Settings $settings -Force

Write-Host "✅ [GoldLab] Windows Scheduled Task 'GoldLab_KGE_AutoSync' successfully registered!"
