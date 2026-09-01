const fs = require('fs');
const path = require('path');

const content = `@echo off
chcp 65001 > nul
title 골드랩 - 한국금거래소 공식 시세 즉시 동기화
echo ========================================================
echo   [골드랩] 한국금거래소 공식 실시간 시세 동기화 시작...
echo ========================================================
echo.
cd /d "c:\\Users\\WD\\Desktop\\작업용\\ju\\골드랩 작업"
node scripts\\sync-and-push.js
echo.
echo ========================================================
echo   동기화 작업이 완료되었습니다. (로그: scripts\\sync-log.txt)
echo ========================================================
timeout /t 5
`;

const rootBat = path.join(__dirname, '..', '수동_즉시동기화.bat');
const scriptsBat = path.join(__dirname, '수동_즉시동기화.bat');
const downloadsBat = path.join(process.env.USERPROFILE || 'C:\\Users\\WD', 'Downloads', '수동_즉시동기화.bat');

fs.writeFileSync(rootBat, content, 'utf8');
fs.writeFileSync(scriptsBat, content, 'utf8');
try {
  fs.writeFileSync(downloadsBat, content, 'utf8');
  console.log('✅ Updated Downloads bat file:', downloadsBat);
} catch (e) {
  console.error('Error writing to Downloads:', e.message);
}

console.log('✅ Updated Root bat file:', rootBat);
console.log('✅ Updated Scripts bat file:', scriptsBat);
