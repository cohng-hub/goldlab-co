/**
 * GoldLab Auto-Sync & Git Auto-Push Engine (Local Korean Network Edition)
 * Fetches 100% official rates from koreagoldx.co.kr in 0.1s and pushes directly to GitHub.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOG_FILE = path.join(__dirname, 'sync-log.txt');
const SYNC_SCRIPT = path.join(__dirname, 'sync-kge-rates.js');

function log(msg) {
  const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const line = `[${time}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) {}
}

async function run() {
  log('====================================================');
  log('🚀 [GoldLab Auto-Sync] Local sync process started.');

  try {
    // 1. Run rate sync script
    log('📡 Fetching official Korea Gold Exchange rates...');
    const syncOutput = execSync(`node "${SYNC_SCRIPT}"`, { cwd: ROOT_DIR, encoding: 'utf8' });
    log(syncOutput.trim());

    // 2. Check git status for changes
    const status = execSync('git status --porcelain app.js index.html wholesale.html mypage.html', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();

    if (!status) {
      log('ℹ️ [GoldLab Auto-Sync] Rates are already up to date. No git commit needed.');
      log('====================================================\n');
      return;
    }

    log('📝 Detected rate updates. Committing and pushing to GitHub...');
    execSync('git add app.js index.html wholesale.html mypage.html', { cwd: ROOT_DIR });
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    execSync(`git commit -m "[Auto-Sync] Update official Korea Gold Exchange live rates (${dateStr})"`, { cwd: ROOT_DIR });
    execSync('git push origin main', { cwd: ROOT_DIR });

    log(`🎉 [GoldLab Auto-Sync] Successfully synchronized & deployed to GitHub at ${dateStr}!`);
  } catch (err) {
    log(`❌ [GoldLab Auto-Sync] Error occurred: ${err.message}`);
    if (err.stdout) log(`stdout: ${err.stdout}`);
    if (err.stderr) log(`stderr: ${err.stderr}`);
  }
  log('====================================================\n');
}

run();
