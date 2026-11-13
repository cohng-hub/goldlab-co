/**
 * Korea Gold Exchange (koreagoldx.co.kr) Real-Time Rate Sync Engine
 * Production Engine for GitHub Actions & Local execution
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const WHOLESALE_HTML_PATH = path.join(ROOT_DIR, 'wholesale.html');
const MYPAGE_HTML_PATH = path.join(ROOT_DIR, 'mypage.html');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchKGEWithFetch(timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  try {
    // Step 1: Visit main page to acquire session cookies (JSESSIONID, AWSALB) and CSRF token
    const homeRes = await fetch('https://www.koreagoldx.co.kr/', {
      method: 'GET',
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });

    const rawCookies = typeof homeRes.headers.getSetCookie === 'function'
      ? homeRes.headers.getSetCookie()
      : (homeRes.headers.get('set-cookie') ? [homeRes.headers.get('set-cookie')] : []);
    const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

    const html = await homeRes.text();
    const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+name="csrf-token"/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    // Step 2: Request official rates from /api/main with valid session & CSRF headers
    const reqHeaders = {
      'User-Agent': ua,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'https://www.koreagoldx.co.kr',
      'Referer': 'https://www.koreagoldx.co.kr/',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    };
    if (cookieHeader) reqHeaders['Cookie'] = cookieHeader;
    if (csrfToken) reqHeaders['X-CSRF-TOKEN'] = csrfToken;

    const res = await fetch('https://www.koreagoldx.co.kr/api/main', {
      method: 'POST',
      headers: reqHeaders,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const rawText = await res.text();
    console.log(`[Diagnostic] HTTP Status: ${res.status}, Body length: ${rawText.length}, Sample: ${rawText.substring(0, 200)}`);

    if (!res.ok) {
      throw new Error(`KGE API responded with HTTP status ${res.status}: ${rawText.substring(0, 100)}`);
    }

    const json = JSON.parse(rawText);
    if (!json.officialPrice4 || !json.officialPrice4.s_pure) {
      throw new Error('KGE API response is missing officialPrice4 data');
    }

    return json.officialPrice4;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[Diagnostic] Fetch Catch Error: ${err.name} - ${err.message}`);
    throw err;
  }
}

async function fetchWithRetries(maxRetries = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`📡 [GoldLab Sync] Connecting to Korea Gold Exchange (Attempt ${attempt}/${maxRetries})...`);
    try {
      const data = await fetchKGEWithFetch(15000);
      return data;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ [GoldLab Sync] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const waitMs = attempt * 2000;
        console.log(`⏳ Retrying in ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function main() {
  console.log('🔄 [GoldLab Sync] Starting Korea Gold Exchange Official Rate Sync...');
  try {
    const p = await fetchWithRetries(5);
    console.log('✅ [GoldLab Sync] Successfully received rates from KGE:', {
      date: p.date,
      s_pure: p.s_pure,
      p_pure: p.p_pure,
      p_18k: p.p_18k,
      p_14k: p.p_14k,
      s_white: p.s_white,
      p_white: p.p_white,
      s_silver: p.s_silver,
      p_silver: p.p_silver
    });

    const rates = {
      "24K_buy": Number(p.s_pure),
      "24K_sell": Number(p.p_pure),
      "18K_sell": Number(p.p_18k),
      "14K_sell": Number(p.p_14k),
      "PT_buy": Number(p.s_white),
      "PT_sell": Number(p.p_white),
      "AG_buy": Number(p.s_silver),
      "AG_sell": Number(p.p_silver)
    };

    const changes = {
      "24K_buy_diff": Number(p.turm_s_pure) || 0,
      "24K_buy_per": Number(p.per_s_pure) || 0,
      "24K_sell_diff": Number(p.turm_p_pure) || 0,
      "24K_sell_per": Number(p.per_p_pure) || 0,
      "18K_sell_diff": Number(p.turm_p_18k) || 0,
      "18K_sell_per": Number(p.per_p_18k) || 0,
      "14K_sell_diff": Number(p.turm_p_14k) || 0,
      "14K_sell_per": Number(p.per_p_14k) || 0,
      "PT_sell_diff": Number(p.turm_p_white) || 0,
      "PT_sell_per": Number(p.per_p_white) || 0,
      "AG_sell_diff": Number(p.turm_p_silver) || 0,
      "AG_sell_per": Number(p.per_p_silver) || 0,
      "date": p.date ? p.date.substring(0, 10).replace(/-/g, '.') : new Date().toISOString().substring(0, 10).replace(/-/g, '.')
    };

    const versionTag = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 12);

    // 1. Update app.js
    if (fs.existsSync(APP_JS_PATH)) {
      let appJs = fs.readFileSync(APP_JS_PATH, 'utf8');

      // Update REALTIME_STANDARD_RATES object
      const ratesBlock = `let REALTIME_STANDARD_RATES = {\n  "24K_buy": ${rates["24K_buy"]},\n  "24K_sell": ${rates["24K_sell"]},\n  "18K_sell": ${rates["18K_sell"]},\n  "14K_sell": ${rates["14K_sell"]},\n  "PT_buy": ${rates["PT_buy"]},\n  "PT_sell": ${rates["PT_sell"]},\n  "AG_buy": ${rates["AG_buy"]},\n  "AG_sell": ${rates["AG_sell"]}\n};`;
      appJs = appJs.replace(/let REALTIME_STANDARD_RATES = \{[\s\S]*?\};/, ratesBlock);

      // Update REALTIME_RATE_CHANGES object
      const changesBlock = `let REALTIME_RATE_CHANGES = {\n  "24K_buy_diff": ${changes["24K_buy_diff"]},\n  "24K_buy_per": ${changes["24K_buy_per"]},\n  "24K_sell_diff": ${changes["24K_sell_diff"]},\n  "24K_sell_per": ${changes["24K_sell_per"]},\n  "18K_sell_diff": ${changes["18K_sell_diff"]},\n  "18K_sell_per": ${changes["18K_sell_per"]},\n  "14K_sell_diff": ${changes["14K_sell_diff"]},\n  "14K_sell_per": ${changes["14K_sell_per"]},\n  "PT_sell_diff": ${changes["PT_sell_diff"]},\n  "PT_sell_per": ${changes["PT_sell_per"]},\n  "AG_sell_diff": ${changes["AG_sell_diff"]},\n  "AG_sell_per": ${changes["AG_sell_per"]},\n  "date": "${changes.date}"\n};`;
      appJs = appJs.replace(/let REALTIME_RATE_CHANGES = \{[\s\S]*?\};/, changesBlock);

      fs.writeFileSync(APP_JS_PATH, appJs, 'utf8');
      console.log('✅ [GoldLab Sync] app.js rates updated.');
    }

    // 2. Update cache busting in HTML files
    [INDEX_HTML_PATH, WHOLESALE_HTML_PATH, MYPAGE_HTML_PATH].forEach(htmlPath => {
      if (fs.existsSync(htmlPath)) {
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(/src="app\.js\?v=[^"]*"/g, `src="app.js?v=${versionTag}"`);
        fs.writeFileSync(htmlPath, html, 'utf8');
      }
    });
    console.log(`✅ [GoldLab Sync] HTML cache buster updated (v=${versionTag}).`);

    console.log('🎉 [GoldLab Sync] Successfully completed all sync tasks!');
  } catch (err) {
    console.error('❌ [GoldLab Sync] Fatal Error during rate sync:', err.message);
    process.exit(1);
  }
}

main();
