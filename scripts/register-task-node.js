const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const nodePath = process.execPath;
const workDir = path.resolve(__dirname, '..');

const psScript = `\uFEFF
$action = New-ScheduledTaskAction -Execute "${nodePath.replace(/\\/g, '\\\\')}" -Argument "scripts\\\\sync-and-push.js" -WorkingDirectory "${workDir.replace(/\\/g, '\\\\')}"

# 1. Daily recurring trigger (every 20 mins between 10:15 and 17:15)
$triggerDaily = New-ScheduledTaskTrigger -Daily -At "10:15"
$triggerDaily.Repetition = (New-ScheduledTaskTrigger -Once -At "10:15" -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Hours 7)).Repetition

# 2. At Logon trigger (runs immediately whenever PC boots and user logs in)
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "GoldLab_KGE_AutoSync" -Action $action -Trigger @($triggerDaily, $triggerLogon) -Settings $settings -Force
`;

const psPath = path.join(__dirname, 'register-task.ps1');
fs.writeFileSync(psPath, psScript, 'utf8');

const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { encoding: 'utf8' });
console.log('✅ Task registered with Daily + Boot/Logon triggers!');
