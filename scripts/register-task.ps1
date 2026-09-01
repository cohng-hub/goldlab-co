
$action = New-ScheduledTaskAction -Execute "C:\\Program Files\\nodejs\\node.exe" -Argument "scripts\\sync-and-push.js" -WorkingDirectory "C:\\Users\\WD\\Desktop\\작업용\\ju\\골드랩 작업"
$trigger = New-ScheduledTaskTrigger -Daily -At "10:15"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "10:15" -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Hours 7)).Repetition
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "GoldLab_KGE_AutoSync" -Action $action -Trigger $trigger -Settings $settings -Force
