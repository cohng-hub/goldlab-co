
$action = New-ScheduledTaskAction -Execute "C:\\Program Files\\nodejs\\node.exe" -Argument "scripts\\sync-and-push.js" -WorkingDirectory "C:\\Users\\WD\\Desktop\\작업용\\ju\\골드랩 작업"

# 1. Daily recurring trigger (every 20 mins between 10:15 and 17:15)
$triggerDaily = New-ScheduledTaskTrigger -Daily -At "10:15"
$triggerDaily.Repetition = (New-ScheduledTaskTrigger -Once -At "10:15" -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Hours 7)).Repetition

# 2. At Logon trigger (runs immediately whenever PC boots and user logs in)
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "GoldLab_KGE_AutoSync" -Action $action -Trigger @($triggerDaily, $triggerLogon) -Settings $settings -Force
