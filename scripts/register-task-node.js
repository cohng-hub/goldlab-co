const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const nodePath = process.execPath;
const workDir = path.resolve(__dirname, '..');
const scriptPath = path.join(__dirname, 'sync-and-push.js');

console.log('Node Path:', nodePath);
console.log('Work Dir:', workDir);
console.log('Script Path:', scriptPath);

const psScript = `\uFEFF
$action = New-ScheduledTaskAction -Execute "${nodePath.replace(/\\/g, '\\\\')}" -Argument "scripts\\\\sync-and-push.js" -WorkingDirectory "${workDir.replace(/\\/g, '\\\\')}"
$trigger = New-ScheduledTaskTrigger -Daily -At "10:15"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "10:15" -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Hours 7)).Repetition
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "GoldLab_KGE_AutoSync" -Action $action -Trigger $trigger -Settings $settings -Force
`;

const psPath = path.join(__dirname, 'register-task.ps1');
fs.writeFileSync(psPath, psScript, 'utf8');

const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { encoding: 'utf8' });
console.log(out);

console.log('Testing immediate execution...');
execSync('powershell -Command "Start-ScheduledTask -TaskName \'GoldLab_KGE_AutoSync\'"');
