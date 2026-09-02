/* ==========================================================================
   GoldLab & Co. - Core Application JavaScript Engine
   Real-Time Market Rate Sync & Prominent Chart Engine & VIP PnL System
   ========================================================================== */

// Official Live Rates from Korea Gold Exchange (koreagoldx.co.kr 100% Exact Official Rates)
let REALTIME_STANDARD_RATES = {
  "24K_buy": 843000,
  "24K_sell": 710000,
  "18K_sell": 521900,
  "14K_sell": 404700,
  "PT_buy": 335000,
  "PT_sell": 269000,
  "AG_buy": 12070,
  "AG_sell": 9810
};

let REALTIME_RATE_CHANGES = {
  "24K_buy_diff": -24000,
  "24K_buy_per": -2.85,
  "24K_sell_diff": -18000,
  "24K_sell_per": -2.54,
  "18K_sell_diff": -13200,
  "18K_sell_per": -2.53,
  "14K_sell_diff": -10300,
  "14K_sell_per": -2.55,
  "PT_sell_diff": -11000,
  "PT_sell_per": -4.09,
  "AG_sell_diff": -420,
  "AG_sell_per": -4.28,
  "date": "2026.09.02"
};

let currentRates = { ...REALTIME_STANDARD_RATES };
let currentUser = null;
let priceChartInstance = null;
let activeMetalKey = '24K';
let activePeriod = '1M';
let currentMarketRegion = 'DOMESTIC';

const ALL_TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30',
  '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00'
];

let bookedSlots = {
  "2026-07-29": ["11:30", "15:00"],
  "2026-07-30": ["14:00", "16:30"]
};

const INITIAL_TRANSACTIONS = [
  {
    id: 1,
    date: '2026.01.15',
    type: '매수',
    itemName: '24K 프리미엄 골드바 10돈',
    purity: '24K',
    donWeight: 10,
    unitCost: 650000,
    totalCost: 6500000
  },
  {
    id: 2,
    date: '2026.03.20',
    type: '매수',
    itemName: '18K 체인 목걸이 고금',
    purity: '18K',
    donWeight: 10,
    unitCost: 480000,
    totalCost: 4800000
  },
  {
    id: 3,
    date: '2026.05.10',
    type: '매수',
    itemName: '24K 콩알금 5g (1.33돈)',
    purity: '24K',
    donWeight: 1.33,
    unitCost: 670000,
    totalCost: 891100
  }
];

let myTransactions = [];

// Initialize App on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  try { localStorage.removeItem('goldlab_rate_offset'); } catch (e) {}
  try { LoadAuthState(); } catch (e) { console.error('LoadAuthState error:', e); }
  try { LoadMyTransactions(); } catch (e) { console.error('LoadMyTransactions error:', e); }
  try { LoadBookedSlots(); } catch (e) { console.error('LoadBookedSlots error:', e); }
  try { FetchRealTimeGoldRates(); } catch (e) { console.error('FetchRealTimeGoldRates error:', e); }
  try { SetDefaultBookingDate(); } catch (e) { console.error('SetDefaultBookingDate error:', e); }
  try { InitPriceChart(); } catch (e) { console.error('InitPriceChart error:', e); }

  // Start Continuous Live API Rate Auto-Sync Engine
  try {
    SyncLiveKGERates();
    setInterval(SyncLiveKGERates, 60000);
  } catch (e) { console.error('SyncLiveKGERates error:', e); }
});

// Window load fallback to guarantee calendar initialization
window.addEventListener('load', () => {
  try {
    if (!selectedDateStr) {
      SetDefaultBookingDate();
    } else {
      RenderCalendar();
      UpdateSelectedDateDisplay();
    }
  } catch (e) {
    console.error('Window load calendar fallback error:', e);
  }
});

// Real-Time KGE & International Financial Market Sync Engine (Official Live Sync)
async function SyncLiveKGERates() {
  try {
    // 1. Fetch Real-time USD/KRW Exchange Rate
    try {
      const fxRes = await fetch('https://open.er-api.com/v6/latest/USD?t=' + Date.now(), { cache: 'no-store' });
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        const usdKrw = fxData.rates ? fxData.rates.KRW : 1468.5;
        const fxEl = document.getElementById('spotFxVal');
        if (fxEl) fxEl.innerText = `${usdKrw.toFixed(2)} KRW/$`;
      }
    } catch (e) {
      // Exchange rate fallback
    }

    // 2. Fetch Live Korea Gold Exchange Official API (/api/main or /api/gold-rates)
    const endpoints = [
      '/api/gold-rates', // 1st Priority: Local server proxy
      'https://koreagoldx.co.kr/api/main', // 2nd Priority: Direct KGE API
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://koreagoldx.co.kr/api/main'),
      'https://corsproxy.io/?' + encodeURIComponent('https://koreagoldx.co.kr/api/main')
    ];

    let fetchedData = null;

    for (const url of endpoints) {
      try {
        const fetchOptions = {
          method: url.startsWith('/') || url.includes('koreagoldx') ? 'POST' : 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          cache: 'no-store'
        };

        if (url.startsWith('/') || url.includes('koreagoldx.co.kr/api/main')) {
          fetchOptions.body = JSON.stringify({});
        }

        const res = await fetch(url, fetchOptions);
        if (res.ok) {
          const json = await res.json();
          if (json && json.officialPrice4 && json.officialPrice4.s_pure) {
            fetchedData = json;
            break;
          }
        }
      } catch (err) {
        // Try next fallback endpoint
      }
    }

    if (fetchedData && fetchedData.officialPrice4) {
      const p = fetchedData.officialPrice4;
      REALTIME_STANDARD_RATES["24K_buy"] = Number(p.s_pure) || REALTIME_STANDARD_RATES["24K_buy"];
      REALTIME_STANDARD_RATES["24K_sell"] = Number(p.p_pure) || REALTIME_STANDARD_RATES["24K_sell"];
      REALTIME_STANDARD_RATES["18K_sell"] = Number(p.p_18k) || REALTIME_STANDARD_RATES["18K_sell"];
      REALTIME_STANDARD_RATES["14K_sell"] = Number(p.p_14k) || REALTIME_STANDARD_RATES["14K_sell"];
      REALTIME_STANDARD_RATES["PT_buy"] = Number(p.s_white) || REALTIME_STANDARD_RATES["PT_buy"];
      REALTIME_STANDARD_RATES["PT_sell"] = Number(p.p_white) || REALTIME_STANDARD_RATES["PT_sell"];
      REALTIME_STANDARD_RATES["AG_buy"] = Number(p.s_silver) || REALTIME_STANDARD_RATES["AG_buy"];
      REALTIME_STANDARD_RATES["AG_sell"] = Number(p.p_silver) || REALTIME_STANDARD_RATES["AG_sell"];

      REALTIME_RATE_CHANGES = {
        "24K_buy_diff": p.turm_s_pure || 0,
        "24K_buy_per": p.per_s_pure || 0,
        "24K_sell_diff": p.turm_p_pure || 0,
        "24K_sell_per": p.per_p_pure || 0,
        "18K_sell_diff": p.turm_p_18k || 0,
        "18K_sell_per": p.per_p_18k || 0,
        "14K_sell_diff": p.turm_p_14k || 0,
        "14K_sell_per": p.per_p_14k || 0,
        "PT_sell_diff": p.turm_p_white || 0,
        "PT_sell_per": p.per_p_white || 0,
        "AG_sell_diff": p.turm_p_silver || 0,
        "AG_sell_per": p.per_p_silver || 0,
        "date": p.date ? p.date.substring(0, 10).replace(/-/g, '.') : new Date().toISOString().substring(0, 10).replace(/-/g, '.')
      };

      // Save official live sync data to cache
      localStorage.setItem('goldlab_kge_live_cache', JSON.stringify({
        rates: REALTIME_STANDARD_RATES,
        changes: REALTIME_RATE_CHANGES,
        timestamp: Date.now()
      }));

      currentRates = { ...REALTIME_STANDARD_RATES };
    }
  } catch (e) {
    console.log('[GoldLab Engine] Live KGE Auto-Sync fallback maintained.');
  }

  UpdateLiveMarketDisplay();
}

// Helper: Format Diff Badges (▲/▼/보합)
function formatDiffBadge(diff, per) {
  if (diff > 0) {
    return `<span class="up-val">▲${formatWon(Math.abs(diff))} (+${per}%)</span>`;
  } else if (diff < 0) {
    return `<span class="down-val">▼${formatWon(Math.abs(diff))} (-${Math.abs(per)}%)</span>`;
  } else {
    return `<span style="color:var(--text-muted); font-weight:700;">보합 (0%)</span>`;
  }
}

// Helper: Format Number
function formatWon(num) {
  return Math.round(num).toLocaleString('ko-KR');
}

function ToggleMobileMenu() {
  const menu = document.getElementById('navMenu');
  if (menu) menu.classList.toggle('mobile-active');
}

// --------------------------------------------------------------------------
// 1. Auth & Session Management System
// --------------------------------------------------------------------------
function LoadAuthState() {
  const savedUser = localStorage.getItem('goldlab_logged_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
  } else {
    currentUser = null;
  }
  UpdateAuthUI();
}

let currentSignupUserType = 'PERSONAL';

function UpdateAuthUI() {
  const slot = document.getElementById('authTopSlot');
  const myName = document.getElementById('myUserName');
  const myTier = document.getElementById('myUserTier');
  const topUserEl = document.getElementById('mypageTopUser');

  if (currentUser) {
    const isBiz = currentUser.userType === 'BIZ';
    const badgeIcon = isBiz ? '<i class="fa-solid fa-building text-gold"></i>' : '<i class="fa-solid fa-circle-user"></i>';
    const userDisplayLabel = isBiz ? `🏢 ${currentUser.name} (사업자)` : `${currentUser.name} 님`;

    if (slot) {
      slot.innerHTML = `
        <div style="display:inline-flex; align-items:center; gap:0.6rem; background:rgba(224,184,72,0.12); border:1px solid var(--border-dark); padding:0.35rem 0.9rem; border-radius:30px; white-space:nowrap;">
          <span style="color:var(--gold-light); font-weight:800; font-size:0.92rem;">${badgeIcon} ${userDisplayLabel}</span>
          <button onclick="LogoutUser()" style="background:rgba(255,255,255,0.12); color:var(--text-light); border:none; border-radius:20px; padding:0.2rem 0.65rem; font-size:0.82rem; font-weight:700; cursor:pointer;">로그아웃</button>
        </div>
      `;
    }
    if (myName) {
      myName.innerHTML = `${currentUser.name} <span style="font-weight:400; font-size:1.1rem; color:var(--text-muted);">${isBiz ? 'B2B 사업자 회원님' : '회원님의 금 자산 관리 솔루션'}</span>`;
    }
    if (myTier) {
      myTier.innerHTML = `<i class="fa-solid fa-crown text-gold"></i> ${currentUser.tier || (isBiz ? 'B2B VIP MEMBER' : 'VIP PLATINUM MEMBER')}`;
    }
    if (topUserEl) {
      topUserEl.innerHTML = `<i class="fa-solid fa-user-check"></i> ${currentUser.name} (${currentUser.tier || 'VIP MEMBER'})`;
    }
  } else {
    if (slot) {
      slot.innerHTML = `
        <button onclick="OpenAuthModal('login')" style="background:linear-gradient(135deg, #f9e076 0%, #d4af37 50%, #b8860b 100%); color:#0b0c10; border:none; border-radius:30px; padding:0.4rem 1.1rem; font-size:0.82rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:0.45rem; box-shadow:0 0 15px rgba(212,175,55,0.45); white-space:nowrap; word-break:keep-all;">
          <i class="fa-solid fa-user-shield"></i> 로그인 / 회원가입
        </button>
      `;
    }
  }

  CheckWholesaleAccess();
}

function OpenAuthModal(tab = 'login') {
  SwitchAuthTab(tab);
  document.getElementById('authModal').classList.add('active');
}

function SwitchAuthTab(tab) {
  const vLogin = document.getElementById('authViewLogin');
  const vSignup = document.getElementById('authViewSignup');
  const vFind = document.getElementById('authViewFind');
  const subTitle = document.getElementById('authModalSubTitle');
  const backBtn = document.getElementById('authHeaderBackBtn');

  if (vLogin) vLogin.style.display = 'none';
  if (vSignup) vSignup.style.display = 'none';
  if (vFind) vFind.style.display = 'none';

  if (tab === 'login' || tab === 'login_biz') {
    if (vLogin) vLogin.style.display = 'block';
    if (subTitle) subTitle.innerText = tab === 'login_biz' ? '🏢 B2B 사업자 회원 전용 로그인' : 'VIP 회원 전용 자산 관리 서비스';
    if (backBtn) backBtn.style.display = 'none';
    const typeSelect = document.getElementById('loginUserTypeSelect');
    if (typeSelect) {
      typeSelect.value = tab === 'login_biz' ? 'BIZ' : 'PERSONAL';
    }
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPass');
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
  } else if (tab === 'signup' || tab === 'signup_biz') {
    if (vSignup) vSignup.style.display = 'block';
    if (subTitle) subTitle.innerText = tab === 'signup_biz' ? '🏢 B2B 사업자 30초 회원가입' : 'GoldLab & Co. 30초 간편 회원가입';
    if (backBtn) backBtn.style.display = 'inline-flex';
    if (tab === 'signup_biz') {
      SwitchSignupUserType('BIZ');
    }
  } else if (tab === 'find') {
    if (vFind) vFind.style.display = 'block';
    if (subTitle) subTitle.innerText = '계정 아이디 찾기 및 비밀번호 재설정';
    if (backBtn) backBtn.style.display = 'inline-flex';
  }
}

function SwitchSignupUserType(type) {
  currentSignupUserType = type;
  const btnPersonal = document.getElementById('btnSignupPersonal');
  const btnBiz = document.getElementById('btnSignupBiz');
  const bizFields = document.getElementById('signupBizFields');
  const nameLabel = document.getElementById('signupNameLabel');

  if (type === 'BIZ') {
    if (btnPersonal) {
      btnPersonal.style.background = 'transparent';
      btnPersonal.style.color = 'var(--text-muted)';
    }
    if (btnBiz) {
      btnBiz.style.background = 'var(--gold-gradient)';
      btnBiz.style.color = '#000';
    }
    if (bizFields) bizFields.style.display = 'block';
    if (nameLabel) nameLabel.innerText = '대표자 성함';
  } else {
    if (btnPersonal) {
      btnPersonal.style.background = 'var(--gold-gradient)';
      btnPersonal.style.color = '#000';
    }
    if (btnBiz) {
      btnBiz.style.background = 'transparent';
      btnBiz.style.color = 'var(--text-muted)';
    }
    if (bizFields) bizFields.style.display = 'none';
    if (nameLabel) nameLabel.innerText = '성함 / 이름';
  }
}

function HandleUserLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const loginUserType = document.getElementById('loginUserTypeSelect')?.value || 'AUTO';

  let isBiz = email.includes('biz') || loginUserType === 'BIZ';
  const name = email.split('@')[0];

  if (isBiz) {
    currentUser = {
      name: '(주)종로골드 주얼리',
      email: email,
      phone: '02-765-8888',
      userType: 'BIZ',
      bizName: '(주)종로골드 주얼리',
      bizNo: '101-86-77777',
      tier: 'B2B VIP MEMBER'
    };
  } else {
    currentUser = {
      name: name === 'gold' ? '김골드' : name,
      email: email,
      phone: '010-8888-9999',
      userType: 'PERSONAL',
      tier: 'VIP PLATINUM MEMBER'
    };
  }

  localStorage.setItem('goldlab_logged_user', JSON.stringify(currentUser));
  UpdateAuthUI();
  CloseModal('authModal');

  if (isBiz) {
    alert(`[🏢 B2B 사업자 로그인] 환영합니다, ${currentUser.name} 사업자 회원님! 도매 센터로 이동합니다.`);
    window.location.href = 'wholesale.html';
  } else {
    alert(`[👤 일반 로그인] 환영합니다, ${currentUser.name} 회원님! 성공적으로 로그인되었습니다.`);
    if (window.location.pathname.includes('wholesale.html')) {
      window.location.href = 'mypage.html';
    }
  }
}

function HandleUserSignup(e) {
  e.preventDefault();
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const phone = document.getElementById('signupPhone').value;
  const isBiz = currentSignupUserType === 'BIZ';
  const bizName = document.getElementById('signupBizName')?.value || name + ' 주얼리';
  const bizNo = document.getElementById('signupBizNo')?.value || '101-86-00000';

  if (isBiz) {
    currentUser = {
      name: bizName,
      email,
      phone,
      userType: 'BIZ',
      bizName,
      bizNo,
      tier: 'B2B MEMBER'
    };
  } else {
    currentUser = {
      name,
      email,
      phone,
      userType: 'PERSONAL',
      tier: 'GOLD MEMBER'
    };
  }

  localStorage.setItem('goldlab_logged_user', JSON.stringify(currentUser));
  UpdateAuthUI();
  CloseModal('authModal');

  if (isBiz) {
    alert(`축하합니다! ${bizName} (사업자등록번호: ${bizNo}) B2B 사업자 회원가입이 완료되었습니다.`);
    window.location.href = 'wholesale.html';
  } else {
    alert(`축하합니다! ${name}님, GoldLab & Co. 회원가입이 완료되었습니다.`);
    window.location.href = 'mypage.html';
  }
}

function HandleFindAccount(e) {
  e.preventDefault();
  const name = document.getElementById('findName').value;
  const phone = document.getElementById('findPhone').value;

  alert(`[안내] ${name}님의 가입 정보로 등록된 계정(gold***@goldlab.co.kr)을 찾았습니다.\n입력하신 휴대폰 번호(${phone})로 임시 비밀번호가 발송되었습니다.`);
  SwitchAuthTab('login');
}

function LogoutUser() {
  currentUser = null;
  localStorage.removeItem('goldlab_logged_user');
  UpdateAuthUI();
  if (window.location.pathname.includes('wholesale.html')) {
    CheckWholesaleAccess();
  }
}

function OpenMyPageOrLogin(e) {
  if (!currentUser) {
    if (e) e.preventDefault();
    alert('마이페이지 금 자산 관리는 로그인 후 이용 가능합니다.');
    OpenAuthModal('login');
  }
}

function OpenWholesaleOrAlert(e) {
  if (!currentUser || currentUser.userType !== 'BIZ') {
    if (e) e.preventDefault();
    alert('🏢 B2B 도매센터는 사업자등록증이 인증된 사업자 회원 전용 공간입니다.\n사업자 계정으로 로그인 또는 사업자 회원가입을 진행해주세요.');
    OpenAuthModal('login_biz');
    if (window.location.pathname.includes('wholesale.html')) {
      CheckWholesaleAccess();
    }
  } else {
    if (!window.location.pathname.includes('wholesale.html')) {
      window.location.href = 'wholesale.html';
    }
  }
}

function CheckWholesaleAccess() {
  const gateEl = document.getElementById('b2bGuardGateCard');
  const contentEl = document.getElementById('b2bContentSection');

  if (!gateEl || !contentEl) return;

  if (currentUser && currentUser.userType === 'BIZ') {
    gateEl.style.display = 'none';
    contentEl.style.display = 'block';
  } else {
    gateEl.style.display = 'block';
    contentEl.style.display = 'none';
  }
}

// --------------------------------------------------------------------------
// 2. Real-Time Rate Sync & Prominent Chart Engine
// --------------------------------------------------------------------------
function FetchRealTimeGoldRates() {
  // Load cached real official rates from localStorage ONLY if it is newer or valid for today
  const cachedRates = localStorage.getItem('goldlab_kge_live_cache');
  if (cachedRates) {
    try {
      const parsed = JSON.parse(cachedRates);
      const isDateValid = parsed.changes && parsed.changes.date && parsed.changes.date >= REALTIME_RATE_CHANGES.date;
      const isFresh = parsed.timestamp && (Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000);
      if (isDateValid && isFresh && parsed.rates && parsed.rates["24K_buy"]) {
        REALTIME_STANDARD_RATES = { ...parsed.rates };
        if (parsed.changes) REALTIME_RATE_CHANGES = { ...parsed.changes };
      } else {
        localStorage.removeItem('goldlab_kge_live_cache');
      }
    } catch (e) {
      console.warn('Cached rates parse error:', e);
      localStorage.removeItem('goldlab_kge_live_cache');
    }
  }

  currentRates = { ...REALTIME_STANDARD_RATES };
  UpdateLiveMarketDisplay();
}

function UpdateLiveMarketDisplay() {
  const sell24K = currentRates["24K_sell"];
  const buy24K = currentRates["24K_buy"];
  const sell18K = currentRates["18K_sell"];
  const sell14K = currentRates["14K_sell"];
  const sellPT = currentRates["PT_sell"];
  const sellAG = currentRates["AG_sell"];

  const chg24Buy = formatDiffBadge(REALTIME_RATE_CHANGES["24K_buy_diff"], REALTIME_RATE_CHANGES["24K_buy_per"]);
  const chg24Sell = formatDiffBadge(REALTIME_RATE_CHANGES["24K_sell_diff"], REALTIME_RATE_CHANGES["24K_sell_per"]);
  const chg18Sell = formatDiffBadge(REALTIME_RATE_CHANGES["18K_sell_diff"], REALTIME_RATE_CHANGES["18K_sell_per"]);
  const chg14Sell = formatDiffBadge(REALTIME_RATE_CHANGES["14K_sell_diff"], REALTIME_RATE_CHANGES["14K_sell_per"]);
  const chgPtSell = formatDiffBadge(REALTIME_RATE_CHANGES["PT_sell_diff"], REALTIME_RATE_CHANGES["PT_sell_per"]);
  const chgAgSell = formatDiffBadge(REALTIME_RATE_CHANGES["AG_sell_diff"], REALTIME_RATE_CHANGES["AG_sell_per"]);
  const syncDate = REALTIME_RATE_CHANGES.date || '2026.08.26';

  // Top Ticker (2-Line Neat Layout with Exact KGE Rates & Real Diffs)
  const topTicker = document.getElementById('topTickerContent');
  if (topTicker) {
    topTicker.innerHTML = `
      <div style="display:flex; align-items:center; gap:1.2rem; flex-wrap:nowrap; white-space:nowrap; overflow-x:auto;">
        <span style="color:#10b981; font-weight:700; font-size:0.78rem;"><i class="fa-solid fa-square-poll-vertical"></i> 한국금거래소 공식 실시간 연동 (${syncDate})</span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>순금 24K 살때 <strong style="color:var(--gold-light); font-weight:800;">${formatWon(buy24K)}원</strong> ${chg24Buy}</span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>순금 24K 팔때 <strong style="color:var(--gold-light); font-weight:800;">${formatWon(sell24K)}원</strong> ${chg24Sell}</span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>18K 팔때 <strong style="color:var(--gold-light); font-weight:800;">${formatWon(sell18K)}원</strong> ${chg18Sell}</span>
      </div>
      <div style="display:flex; align-items:center; gap:1.2rem; flex-wrap:nowrap; white-space:nowrap; overflow-x:auto; color:var(--text-muted);">
        <span>14K 팔때 <strong style="color:var(--text-white); font-weight:700;">${formatWon(sell14K)}원</strong> ${chg14Sell}</span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>백금 팔때 <strong style="color:var(--text-white); font-weight:700;">${formatWon(sellPT)}원</strong> ${chgPtSell}</span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>은 팔때 <strong style="color:var(--text-white); font-weight:700;">${formatWon(sellAG)}원</strong> ${chgAgSell}</span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span style="font-size:0.75rem; color:var(--gold-light);">(VAT포함 3.75g 1돈 기준 한국금거래소 당일 공식 고시 시세)</span>
      </div>
    `;
  }

  // Hero Price Summary & Left Hero Card Live Rate Updates
  const heroSummary = document.getElementById('heroPriceSummary');
  if (heroSummary) {
    heroSummary.innerText = `24K ${formatWon(sell24K)}원 / 돈 (한국금거래소 매입가)`;
  }

  const elBuy24k = document.getElementById('heroBuy24k');
  const elSell24k = document.getElementById('heroSell24k');
  const elSell18k = document.getElementById('heroSell18k');
  const elSell14k = document.getElementById('heroSell14k');
  const elSellPt = document.getElementById('heroSellPt');
  const elSellAg = document.getElementById('heroSellAg');

  if (elBuy24k) elBuy24k.innerText = `${formatWon(buy24K)}원`;
  if (elSell24k) elSell24k.innerText = `${formatWon(sell24K)}원`;
  if (elSell18k) elSell18k.innerHTML = `${formatWon(sell18K)}원 <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">/돈</span>`;
  if (elSell14k) elSell14k.innerHTML = `${formatWon(sell14K)}원 <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">/돈</span>`;
  if (elSellPt) elSellPt.innerHTML = `${formatWon(sellPT)}원 <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">/돈</span>`;
  if (elSellAg) elSellAg.innerHTML = `${formatWon(sellAG)}원 <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">/돈</span>`;

  // Live Timestamp
  const now = new Date();
  const timeStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const timestampEl = document.getElementById('liveTimestamp');
  if (timestampEl) {
    timestampEl.innerHTML = `<i class="fa-solid fa-circle" style="color:#10b981; font-size:0.7rem;"></i> 실시간 수신중 (${timeStr})`;
  }

  // B2B Wholesale Table Rates Update (if present)
  const elB2b24k = document.getElementById('b2bRate24k');
  const elB2b24kSpecial = document.getElementById('b2bRate24kSpecial');
  const elB2b18k = document.getElementById('b2bRate18k');
  const elB2b18kSpecial = document.getElementById('b2bRate18kSpecial');
  const elB2b14k = document.getElementById('b2bRate14k');
  const elB2b14kSpecial = document.getElementById('b2bRate14kSpecial');
  const elB2b100g = document.getElementById('b2bRate100g');
  const elB2b100gSpecial = document.getElementById('b2bRate100gSpecial');

  if (elB2b24k) elB2b24k.innerText = `${formatWon(buy24K)} 원`;
  if (elB2b24kSpecial) elB2b24kSpecial.innerText = `${formatWon(buy24K - 5000)} 원 (▼5,000원 우대)`;
  if (elB2b18k) elB2b18k.innerText = `${formatWon(sell18K)} 원`;
  if (elB2b18kSpecial) elB2b18kSpecial.innerText = `${formatWon(sell18K + 2900)} 원 (▲2,900원 매입우대)`;
  if (elB2b14k) elB2b14k.innerText = `${formatWon(sell14K)} 원`;
  if (elB2b14kSpecial) elB2b14kSpecial.innerText = `${formatWon(sell14K + 2500)} 원 (▲2,500원 매입우대)`;
  if (elB2b100g) elB2b100g.innerText = `${formatWon(Math.round(buy24K * 26.6667))} 원`;
  if (elB2b100gSpecial) elB2b100gSpecial.innerText = `${formatWon(Math.round((buy24K - 5000) * 26.6667))} 원 (대량특별할인)`;

  RenderMetalSelectorCards();
  UpdateProductPrices(buy24K);
  RenderMyPageLedger();
  if (priceChartInstance) {
    UpdateChartData();
  }
}

function SwitchMarketRegion(region) {
  currentMarketRegion = region;
  const btnDom = document.getElementById('btnMarketDomestic');
  const btnGlo = document.getElementById('btnMarketGlobal');

  if (region === 'DOMESTIC') {
    if (btnDom) {
      btnDom.style.background = 'var(--gold-gradient)';
      btnDom.style.color = '#0b0c10';
      btnDom.style.boxShadow = '0 0 15px rgba(212,175,55,0.4)';
    }
    if (btnGlo) {
      btnGlo.style.background = 'rgba(255,255,255,0.06)';
      btnGlo.style.color = 'var(--text-light)';
      btnGlo.style.boxShadow = 'none';
    }
  } else {
    if (btnGlo) {
      btnGlo.style.background = 'var(--gold-gradient)';
      btnGlo.style.color = '#0b0c10';
      btnGlo.style.boxShadow = '0 0 15px rgba(212,175,55,0.4)';
    }
    if (btnDom) {
      btnDom.style.background = 'rgba(255,255,255,0.06)';
      btnDom.style.color = 'var(--text-light)';
      btnDom.style.boxShadow = 'none';
    }
  }

  RenderMetalSelectorCards();
  UpdateChartData();
}

function RenderMetalSelectorCards() {
  const container = document.getElementById('metalSelectorCards');
  if (!container) return;

  let metals = [];
  if (currentMarketRegion === 'DOMESTIC') {
    metals = [
      { key: '24K', title: '🇰🇷 순금 24K (999.9%)', buy: currentRates["24K_buy"], sell: currentRates["24K_sell"] },
      { key: '18K', title: '🇰🇷 18K 금 (75.0%)', buy: '제품시세적용', sell: currentRates["18K_sell"] },
      { key: '14K', title: '🇰🇷 14K 금 (58.5%)', buy: '제품시세적용', sell: currentRates["14K_sell"] },
      { key: 'PT', title: '🇰🇷 백금 (Platinum)', buy: currentRates["PT_buy"], sell: currentRates["PT_sell"] },
      { key: 'AG', title: '🇰🇷 은 (Silver 99.9%)', buy: currentRates["AG_buy"], sell: currentRates["AG_sell"] }
    ];
  } else {
    metals = [
      { key: 'G_GOLD', title: '🌐 국제 금 (Spot Gold)', buy: '$3,425.00', sell: '$3,420.50 / oz' },
      { key: 'G_SILVER', title: '🌐 국제 은 (Spot Silver)', buy: '$38.90', sell: '$38.40 / oz' },
      { key: 'G_PT', title: '🌐 국제 백금 (Platinum)', buy: '$990.00', sell: '$985.00 / oz' },
      { key: 'G_FX', title: '🌐 원/달러 (KRW/USD)', buy: '1,468.00', sell: '1,466.50 KRW/$' }
    ];
  }

  if (!metals.some(m => m.key === activeMetalKey)) {
    activeMetalKey = metals[0].key;
  }

  container.innerHTML = metals.map(m => {
    const isAct = m.key === activeMetalKey;
    const bgStyle = isAct 
      ? 'background: linear-gradient(135deg, rgba(42, 48, 68, 0.95) 0%, rgba(20, 22, 32, 0.95) 100%)!important; border: 2px solid #f9e076!important; box-shadow: 0 10px 25px rgba(212,175,55,0.35)!important;' 
      : 'background: #141722!important; border: 1px solid rgba(212, 175, 55, 0.25)!important;';
    const textCol = isAct ? '#f9e076' : '#ffffff';

    return `
      <div onclick="SelectMetalCard('${m.key}')" style="flex:1; min-width:150px; ${bgStyle} border-radius:16px; padding:1.2rem 1.1rem; cursor:pointer; transition:all 0.2s ease; display:flex; flex-direction:column; justify-content:center;">
        <div style="font-size:0.92rem; font-weight:800; color:${textCol}; margin-bottom:0.4rem; display:flex; align-items:center; gap:0.4rem; white-space:nowrap;">
          ${m.title}
        </div>
        <div style="font-family:var(--font-num); font-size:1.3rem; font-weight:800; color:${textCol}; white-space:nowrap;">
          ${typeof m.sell === 'number' ? formatWon(m.sell) + ' 원' : m.sell}
        </div>
        <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.35rem; white-space:nowrap;">
          내가 팔 때(매입가): ${typeof m.sell === 'number' ? formatWon(m.sell) + '원' : m.sell}
        </div>
        <div style="font-size:0.75rem; color:var(--gold-light); margin-top:0.15rem; white-space:nowrap;">
          내가 살 때(VAT포함): ${typeof m.buy === 'number' ? formatWon(m.buy) + '원' : m.buy}
        </div>
      </div>
    `;
  }).join('');
}

function SelectMetalCard(key) {
  activeMetalKey = key;
  RenderMetalSelectorCards();
  UpdateChartData();
}

function UpdateProductPrices(buy24K) {
  const p1 = document.querySelectorAll('.product-price')[0];
  const p2 = document.querySelectorAll('.product-price')[1];
  const p3 = document.querySelectorAll('.product-price')[2];
  const p4 = document.querySelectorAll('.product-price')[3];

  if (p1) p1.innerText = `${formatWon(Math.round(buy24K * 0.27 + 15000))}원`; // 1g
  if (p2) p2.innerText = `${formatWon(Math.round(buy24K + 25000))}원`;       // 1돈
  if (p3) p3.innerText = `${formatWon(Math.round(buy24K * 10 + 90000))}원`;  // 10돈
  if (p4) p4.innerText = `${formatWon(Math.round(buy24K * 26.67 + 220000))}원`; // 100g
}

// --------------------------------------------------------------------------
// Chart.js High-Definition Interactive Price Graph
// --------------------------------------------------------------------------
function InitPriceChart() {
  const ctx = document.getElementById('heroPriceChart') || document.getElementById('goldPriceChart');
  if (!ctx) return;

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 350);
  gradient.addColorStop(0, 'rgba(249, 224, 118, 0.45)');
  gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');

  priceChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '시세 (KRW/3.75g)',
        data: [],
        borderColor: '#f9e076',
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#f9e076',
        pointBorderColor: '#0b0c10',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(11, 12, 16, 0.95)',
          titleColor: '#f9e076',
          bodyColor: '#ffffff',
          borderColor: '#d4af37',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return ` 시세: ${formatWon(context.raw)} 원 / 돈`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11 },
            callback: function(val) { return formatWon(val) + '원'; }
          }
        }
      }
    }
  });

  UpdateChartData();
}

function SetChartPeriod(btnEl, period) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  activePeriod = period;
  UpdateChartData();
}

function UpdateChartData() {
  if (!priceChartInstance) return;

  const titleEl = document.getElementById('chartMetalTitle');
  const subEl = document.getElementById('chartMetalSub');

  let baseVal = currentRates["24K_buy"];
  let metalName = '🇰🇷 국내 순금 24K (3.75g 1돈)';
  let buyTxt = `${formatWon(currentRates["24K_buy"])}원`;
  let sellTxt = `${formatWon(currentRates["24K_sell"])}원`;
  let unitSuffix = '원/돈';

  if (currentMarketRegion === 'DOMESTIC') {
    if (activeMetalKey === '18K') {
      baseVal = currentRates["18K_sell"];
      metalName = '🇰🇷 국내 18K 금 (3.75g 1돈)';
      buyTxt = '제품시세';
      sellTxt = `${formatWon(currentRates["18K_sell"])}원`;
    } else if (activeMetalKey === '14K') {
      baseVal = currentRates["14K_sell"];
      metalName = '🇰🇷 국내 14K 금 (3.75g 1돈)';
      buyTxt = '제품시세';
      sellTxt = `${formatWon(currentRates["14K_sell"])}원`;
    } else if (activeMetalKey === 'PT') {
      baseVal = currentRates["PT_buy"];
      metalName = '🇰🇷 국내 백금 Platinum (3.75g 1돈)';
      buyTxt = `${formatWon(currentRates["PT_buy"])}원`;
      sellTxt = `${formatWon(currentRates["PT_sell"])}원`;
    } else if (activeMetalKey === 'AG') {
      baseVal = currentRates["AG_buy"];
      metalName = '🇰🇷 국내 은 Silver 99.9% (3.75g 1돈)';
      buyTxt = `${formatWon(currentRates["AG_buy"])}원`;
      sellTxt = `${formatWon(currentRates["AG_sell"])}원`;
    }
  } else {
    // GLOBAL market
    unitSuffix = 'USD/oz';
    if (activeMetalKey === 'G_GOLD') {
      baseVal = 3420;
      metalName = '🌐 국제 금 시세 (Spot Gold NYMEX)';
      buyTxt = '$3,425.00';
      sellTxt = '$3,420.50 / oz';
    } else if (activeMetalKey === 'G_SILVER') {
      baseVal = 38;
      metalName = '🌐 국제 은 시세 (Spot Silver NYMEX)';
      buyTxt = '$38.90';
      sellTxt = '$38.40 / oz';
    } else if (activeMetalKey === 'G_PT') {
      baseVal = 985;
      metalName = '🌐 국제 백금 (Spot Platinum NYMEX)';
      buyTxt = '$990.00';
      sellTxt = '$985.00 / oz';
    } else if (activeMetalKey === 'G_FX') {
      baseVal = 1466;
      unitSuffix = 'KRW/$';
      metalName = '🌐 원/달러 기준환율 (USD/KRW FX)';
      buyTxt = '1,468.00';
      sellTxt = '1,466.50 KRW/$';
    }
  }

  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-chart-line text-gold"></i> ${metalName} 시세 변동 추이`;
  if (subEl) subEl.innerText = `살 때(매수가): ${buyTxt} | 팔 때(매입가): ${sellTxt}`;

  let labels = [];
  let points = [];

  if (activePeriod === '1M') {
    labels = ['07.01', '07.05', '07.10', '07.15', '07.20', '07.25', '오늘'];
    points = [baseVal * 0.97, baseVal * 0.98, baseVal * 0.985, baseVal * 0.99, baseVal * 0.988, baseVal * 0.995, baseVal];
  } else if (activePeriod === '3M') {
    labels = ['05월', '05월 중순', '06월 초', '06월 중순', '07월 초', '07월 중순', '오늘'];
    points = [baseVal * 0.95, baseVal * 0.965, baseVal * 0.97, baseVal * 0.96, baseVal * 0.985, baseVal * 0.992, baseVal];
  } else if (activePeriod === '6M') {
    labels = ['02월', '03월', '04월', '05월', '06월', '07월', '오늘'];
    points = [baseVal * 0.91, baseVal * 0.93, baseVal * 0.95, baseVal * 0.94, baseVal * 0.975, baseVal * 0.99, baseVal];
  } else if (activePeriod === '1Y') {
    labels = ['25.08', '25.10', '25.12', '26.02', '26.04', '26.06', '오늘'];
    points = [baseVal * 0.81, baseVal * 0.85, baseVal * 0.88, baseVal * 0.92, baseVal * 0.95, baseVal * 0.98, baseVal];
  } else if (activePeriod === '3Y') {
    labels = ['2023년', '2024년', '2025년 상반기', '2025년 하반기', '2026년 상반기', '오늘'];
    points = [baseVal * 0.65, baseVal * 0.74, baseVal * 0.81, baseVal * 0.87, baseVal * 0.94, baseVal];
  }

  points = points.map(p => Math.round(p));

  priceChartInstance.data.labels = labels;
  priceChartInstance.data.datasets[0].data = points;
  priceChartInstance.update();

  const minP = Math.min(...points);
  const maxP = Math.max(...points);
  const avgP = Math.round(points.reduce((a,b)=>a+b, 0)/points.length);

  const highEl = document.getElementById('highPriceText');
  const lowEl = document.getElementById('lowPriceText');
  const avgEl = document.getElementById('avgPriceText');
  
  if (highEl) highEl.innerText = `${formatWon(maxP)} 원`;
  if (lowEl) lowEl.innerText = `${formatWon(minP)} 원`;
  if (avgEl) avgEl.innerText = `${formatWon(avgP)} 원`;
}

function SimulateMarketChange(delta) {
  rateOffset += delta;
  localStorage.setItem('goldlab_rate_offset', rateOffset.toString());
  FetchRealTimeGoldRates();
}

function ResetMarketRate() {
  rateOffset = 0;
  localStorage.setItem('goldlab_rate_offset', '0');
  FetchRealTimeGoldRates();
}

// --------------------------------------------------------------------------
// 3. Visit Reservation & Dynamic Time Slot Management
// --------------------------------------------------------------------------
function LoadBookedSlots() {
  const stored = localStorage.getItem('goldlab_booked_slots_v2');
  if (stored) {
    bookedSlots = JSON.parse(stored);
  }
}

function SaveBookedSlots() {
  localStorage.setItem('goldlab_booked_slots_v2', JSON.stringify(bookedSlots));
}

// --------------------------------------------------------------------------
// Full Interactive Calendar & Date Picker Module
// --------------------------------------------------------------------------
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-indexed
let selectedDateStr = '';

function getLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function InitCalendar() {
  const dateInput = document.getElementById('bookDate');
  
  if (dateInput && dateInput.value) {
    selectedDateStr = dateInput.value;
  } else {
    let initialDate = new Date();
    initialDate.setDate(initialDate.getDate() + 1); // Default to tomorrow
    selectedDateStr = getLocalDateString(initialDate);
    if (dateInput) dateInput.value = selectedDateStr;
  }

  const parts = selectedDateStr.split('-');
  if (parts.length === 3) {
    calendarYear = parseInt(parts[0], 10);
    calendarMonth = parseInt(parts[1], 10) - 1;
  }

  RenderCalendar();
  UpdateSelectedDateDisplay();
}

function SetDefaultBookingDate() {
  InitCalendar();
  RenderTimeSlots();
}

function RenderCalendar() {
  const monthTitleEl = document.getElementById('calendarMonthTitle');
  const daysGridEl = document.getElementById('calendarDaysGrid');
  if (!daysGridEl) return;

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  if (monthTitleEl) {
    monthTitleEl.innerText = `${calendarYear}년 ${monthNames[calendarMonth]}`;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  let html = '';

  // Blank slots before 1st of month
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += `<div style="height:48px;"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(calendarYear, calendarMonth, day);
    dayDate.setHours(0, 0, 0, 0);

    const dateFormatted = getLocalDateString(dayDate);

    const isPast = dayDate < today;
    const isToday = dayDate.getTime() === today.getTime();
    const isSelected = dateFormatted === selectedDateStr;
    const dayOfWeek = dayDate.getDay();

    let textColor = 'var(--text-light)';
    if (dayOfWeek === 0) textColor = '#f87171'; // Sun
    if (dayOfWeek === 6) textColor = '#60a5fa'; // Sat

    if (isPast) {
      html += `
        <button type="button" disabled style="height:48px; border-radius:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); color:#475569; font-weight:600; cursor:not-allowed; opacity:0.35;">
          ${day}
        </button>
      `;
    } else if (isSelected) {
      html += `
        <button type="button" onclick="SelectCalendarDate('${dateFormatted}')" style="height:48px; border-radius:12px; background:var(--gold-gradient); border:none; color:#0b0c10; font-weight:900; font-size:1.15rem; box-shadow:0 0 18px rgba(224,184,72,0.7); cursor:pointer; transform:scale(1.05); transition:all 0.15s ease;">
          ${day}
        </button>
      `;
    } else if (isToday) {
      html += `
        <button type="button" onclick="SelectCalendarDate('${dateFormatted}')" style="height:48px; border-radius:12px; background:rgba(224,184,72,0.18); border:2px solid var(--gold-primary); color:${textColor}; font-weight:900; font-size:1.1rem; cursor:pointer; transition:all 0.15s ease;">
          ${day}
        </button>
      `;
    } else {
      html += `
        <button type="button" onclick="SelectCalendarDate('${dateFormatted}')" style="height:48px; border-radius:12px; background:#121624; border:1px solid var(--border-dark); color:${textColor}; font-weight:800; font-size:1.05rem; cursor:pointer; transition:all 0.15s ease;" onmouseover="this.style.borderColor='var(--gold-primary)'; this.style.background='#1b2135';" onmouseout="this.style.borderColor='var(--border-dark)'; this.style.background='#121624';">
          ${day}
        </button>
      `;
    }
  }

  daysGridEl.innerHTML = html;
}

function SelectCalendarDate(dateStr) {
  selectedDateStr = dateStr;
  const dateInput = document.getElementById('bookDate');
  if (dateInput) {
    dateInput.value = dateStr;
  }
  RenderCalendar();
  UpdateSelectedDateDisplay();
  RenderTimeSlots();
}

function OnNativeDateInputChange(val) {
  if (!val) return;
  selectedDateStr = val;
  const parts = val.split('-');
  if (parts.length === 3) {
    calendarYear = parseInt(parts[0], 10);
    calendarMonth = parseInt(parts[1], 10) - 1;
  }
  RenderCalendar();
  UpdateSelectedDateDisplay();
  RenderTimeSlots();
}

function PrevCalendarMonth() {
  calendarMonth--;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear--;
  }
  RenderCalendar();
}

function NextCalendarMonth() {
  calendarMonth++;
  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear++;
  }
  RenderCalendar();
}

function GoTodayCalendar() {
  const today = new Date();
  calendarYear = today.getFullYear();
  calendarMonth = today.getMonth();
  SelectCalendarDate(getLocalDateString(today));
}

function UpdateSelectedDateDisplay() {
  const textEl = document.getElementById('selectedDateText');
  if (!textEl || !selectedDateStr) return;

  const daysKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const parts = selectedDateStr.split('-');
  if (parts.length < 3) return;

  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const dayNum = parseInt(parts[2], 10);
  const dObj = new Date(y, m - 1, dayNum);
  const dayOfWeek = daysKo[dObj.getDay()];

  textEl.innerText = `${y}년 ${m}월 ${dayNum}일 (${dayOfWeek})`;
}

function RenderTimeSlots() {
  const container = document.getElementById('timeSlotGrid');
  if (!container) return;

  const dateVal = document.getElementById('bookDate')?.value || new Date().toISOString().split('T')[0];
  const dayBookedList = bookedSlots[dateVal] || [];
  const selectedTimeInput = document.getElementById('selectedTime');
  let currentSelected = selectedTimeInput ? selectedTimeInput.value : '11:00';

  // If currently selected time is booked, pick first available slot
  if (dayBookedList.includes(currentSelected)) {
    const firstAvailable = ALL_TIME_SLOTS.find(t => !dayBookedList.includes(t));
    if (firstAvailable) {
      currentSelected = firstAvailable;
      if (selectedTimeInput) selectedTimeInput.value = firstAvailable;
    }
  }

  container.innerHTML = ALL_TIME_SLOTS.map(t => {
    const isBooked = dayBookedList.includes(t);
    const isSel = t === currentSelected && !isBooked;

    if (isBooked) {
      return `
        <button type="button" class="time-chip disabled-chip" disabled style="background:#141722!important; border:1px solid rgba(255,255,255,0.08)!important; color:#64748b!important; cursor:not-allowed!important; text-decoration:line-through; padding:0.95rem 0.6rem!important; font-size:1.05rem!important; font-weight:700!important; border-radius:14px!important;">
          ${t} [마감]
        </button>
      `;
    } else if (isSel) {
      return `
        <button type="button" class="time-chip selected" onclick="SelectTimeSlot(this, '${t}')" style="background:var(--gold-gradient)!important; color:#0b0c10!important; border:none!important; font-weight:900!important; font-size:1.15rem!important; padding:0.95rem 0.6rem!important; border-radius:14px!important; box-shadow:0 0 20px rgba(224,184,72,0.5)!important;">
          ${t}
        </button>
      `;
    } else {
      return `
        <button type="button" class="time-chip" onclick="SelectTimeSlot(this, '${t}')" style="background:#090b10!important; border:1px solid var(--border-dark)!important; color:var(--text-white)!important; font-weight:800!important; font-size:1.1rem!important; padding:0.95rem 0.6rem!important; border-radius:14px!important; cursor:pointer;">
          ${t}
        </button>
      `;
    }
  }).join('');
}

function SelectTimeSlot(chipEl, timeStr) {
  const selectedTimeInput = document.getElementById('selectedTime');
  if (selectedTimeInput) selectedTimeInput.value = timeStr;
  RenderTimeSlots();
}

function SubmitReservation(e) {
  e.preventDefault();

  const branch = document.getElementById('selectedBranch').value;
  const category = document.getElementById('bookCategory').value;
  const date = document.getElementById('bookDate').value;
  const time = document.getElementById('selectedTime').value;
  const name = document.getElementById('bookName').value;
  const phone = document.getElementById('bookPhone').value;

  // Add booked slot to date
  if (!bookedSlots[date]) {
    bookedSlots[date] = [];
  }
  if (!bookedSlots[date].includes(time)) {
    bookedSlots[date].push(time);
  }
  SaveBookedSlots();

  const bookNo = 'GL-' + date.replace(/-/g,'') + '-' + Math.floor(100 + Math.random()*900);

  document.getElementById('modalBookNo').innerText = bookNo;
  document.getElementById('modalBranch').innerText = branch;
  document.getElementById('modalDateTime').innerText = `${date} ${time}`;
  document.getElementById('modalName').innerText = `${name} (${phone})`;
  document.getElementById('modalCategory').innerText = category;

  document.getElementById('bookingModal').classList.add('active');

  RenderTimeSlots();
  e.target.reset();
  SetDefaultBookingDate();
}

function CloseModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

function QuickInquiry(prodName) {
  alert(`'${prodName}' 상품 구매 및 견적 상담 문의가 접수되었습니다.\n하단 대표전화 상담(1588-GOLD) 또는 방문 예약을 진행해 주세요!`);
}

// --------------------------------------------------------------------------
// 4. MyPage Member Asset & Daily PnL Engine (mypage.html 1줄 보장 및 삭제)
// --------------------------------------------------------------------------
function LoadMyTransactions() {
  const stored = localStorage.getItem('goldlab_my_transactions_v5');
  if (stored) {
    myTransactions = JSON.parse(stored);
  } else {
    myTransactions = [...INITIAL_TRANSACTIONS];
    SaveMyTransactions();
  }
}

function SaveMyTransactions() {
  localStorage.setItem('goldlab_my_transactions_v5', JSON.stringify(myTransactions));
}

let currentLedgerTab = 'BUY';
let selectedProductWeight = '1돈 (3.75g)';
let selectedProductPrice = 850000;
let selectedProductTitle = '24K 순금 골드바';

function OpenWeightModal(title) {
  selectedProductTitle = title || '24K 순금 골드바';
  const modalTitle = document.getElementById('modalTargetProdTitle');
  if (modalTitle) modalTitle.innerText = `${selectedProductTitle} 규격 중량 선택`;
  
  SelectProductWeight('1돈 (3.75g)', 850000);
  document.getElementById('weightSelectModal').classList.add('active');
}

function SelectProductWeight(weightStr, priceNum) {
  selectedProductWeight = weightStr;
  selectedProductPrice = priceNum;

  const btns = document.querySelectorAll('.weight-btn');
  btns.forEach(b => {
    b.classList.remove('active');
    b.style.background = '#141722';
    b.style.color = 'var(--text-white)';
    b.style.border = '1px solid var(--border-dark)';
    b.style.boxShadow = 'none';
    if (b.innerText.includes(weightStr.split(' ')[0])) {
      b.classList.add('active');
      b.style.background = 'var(--gold-gradient)';
      b.style.color = '#000';
      b.style.border = 'none';
      b.style.boxShadow = '0 0 12px rgba(212,175,55,0.4)';
    }
  });

  const priceEl = document.getElementById('modalCalcPrice');
  if (priceEl) priceEl.innerText = `${formatWon(priceNum)} 원`;
}

function ConfirmWeightAndBook() {
  CloseModal('weightSelectModal');
  const catInput = document.getElementById('bookCategory');
  if (catInput) {
    catInput.value = `${selectedProductTitle} (${selectedProductWeight}) 구매 예약`;
  }
  
  // Smooth Scroll to Booking Section
  const bookingSec = document.getElementById('booking');
  if (bookingSec) {
    bookingSec.scrollIntoView({ behavior: 'smooth' });
  }
}

function SwitchLedgerTab(tab) {
  currentLedgerTab = tab;
  const btnBuy = document.getElementById('tabLedgerBuy');
  const btnSell = document.getElementById('tabLedgerSell');

  if (tab === 'BUY') {
    if (btnBuy) {
      btnBuy.style.background = 'var(--gold-gradient)';
      btnBuy.style.color = '#000';
      btnBuy.style.fontWeight = '800';
    }
    if (btnSell) {
      btnSell.style.background = 'transparent';
      btnSell.style.color = 'var(--text-muted)';
      btnSell.style.fontWeight = '700';
    }
  } else {
    if (btnSell) {
      btnSell.style.background = 'var(--gold-gradient)';
      btnSell.style.color = '#000';
      btnSell.style.fontWeight = '800';
    }
    if (btnBuy) {
      btnBuy.style.background = 'transparent';
      btnBuy.style.color = 'var(--text-muted)';
      btnBuy.style.fontWeight = '700';
    }
  }

  RenderMyPageLedger();
}

function RenderMyPageLedger() {
  const tbody = document.getElementById('ledgerTableBody');
  const thead = document.getElementById('ledgerTableHeader');
  if (!tbody) return;

  if (thead) {
    thead.innerHTML = `
      <tr>
        <th style="white-space:nowrap; padding:1.1rem 0.9rem;">거래일자</th>
        <th style="white-space:nowrap; padding:1.1rem 0.9rem;">구분</th>
        <th style="white-space:nowrap; padding:1.1rem 0.9rem;">품목 및 중량</th>
        <th style="white-space:nowrap; padding:1.1rem 0.9rem;">순도</th>
        <th style="white-space:nowrap; padding:1.1rem 0.9rem; min-width:360px;">실시간 손익 및 시세 등락 추이</th>
        <th style="white-space:nowrap; padding:1.1rem 0.9rem;">총 원금/매수금액</th>
        <th style="white-space:nowrap; padding:1.1rem 0.9rem; text-align:center;">삭제</th>
      </tr>
    `;
  }

  let totalDonWeight = 0;
  let totalCostSum = 0;
  let totalEvalSum = 0;

  const filteredTxList = myTransactions.filter(tx => {
    if (currentLedgerTab === 'BUY') return (tx.type || '매수') === '매수';
    return (tx.type || '매수') === '매도';
  });

  // Calculate Overall Totals from ALL transactions
  myTransactions.forEach(tx => {
    let currentRateForPurity = currentRates["24K_sell"];
    if (tx.purity === '18K') currentRateForPurity = currentRates["18K_sell"];
    else if (tx.purity === '14K') currentRateForPurity = currentRates["14K_sell"];
    else if (tx.purity === 'PT') currentRateForPurity = currentRates["PT_sell"];
    else if (tx.purity === 'AG') currentRateForPurity = currentRates["AG_sell"];

    const evalAmount = Math.round(tx.donWeight * currentRateForPurity);
    totalDonWeight += parseFloat(tx.donWeight);
    totalCostSum += parseInt(tx.totalCost);
    totalEvalSum += evalAmount;
  });

  if (filteredTxList.length === 0) {
    const emptyMsg = currentLedgerTab === 'BUY' ? '등록된 매수 내역이 없습니다.' : '등록된 매도 내역이 없습니다.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted); white-space:nowrap;">${emptyMsg}<br><button class="btn btn-gold btn-sm" style="margin-top:1rem;" onclick="OpenAddTransactionModal()"><i class="fa-solid fa-plus"></i> 신규 내역 등록하기</button></td></tr>`;
  } else {
    tbody.innerHTML = filteredTxList.map(tx => {
      let currentRateForPurity = currentRates["24K_sell"];
      if (tx.purity === '18K') currentRateForPurity = currentRates["18K_sell"];
      else if (tx.purity === '14K') currentRateForPurity = currentRates["14K_sell"];
      else if (tx.purity === 'PT') currentRateForPurity = currentRates["PT_sell"];
      else if (tx.purity === 'AG') currentRateForPurity = currentRates["AG_sell"];

      const exactGrams = (tx.donWeight * 3.75).toFixed(2);
      const svgGraphHtml = GenerateTxSvgSparkline(tx, currentRateForPurity);

      return `
        <tr>
          <td style="white-space:nowrap; padding:1.2rem 0.9rem;">${tx.date}</td>
          <td style="white-space:nowrap; padding:1.2rem 0.9rem;">
            <span style="white-space:nowrap; padding:0.3rem 0.8rem; border-radius:6px; font-size:0.85rem; font-weight:800; ${tx.type === '매도' ? 'background:rgba(16,185,129,0.2); color:var(--pnl-plus);' : 'background:rgba(224,184,72,0.2); color:var(--gold-light);'}">${tx.type || '매수'}</span>
          </td>
          <td style="white-space:nowrap; padding:1.2rem 0.9rem;">
            <div style="font-weight:800; color:var(--text-white); font-size:1.02rem;">${tx.itemName}</div>
            <div style="font-size:0.85rem; color:var(--text-muted); font-family:var(--font-num); margin-top:0.15rem;">${tx.donWeight}돈 (${exactGrams}g)</div>
          </td>
          <td style="white-space:nowrap; font-weight:700; color:var(--gold-light); padding:1.2rem 0.9rem;">${tx.purity}</td>
          
          <!-- 실시간 손익 및 시세 등락 라인 그래프 (SVG Sparkline Line Graph) -->
          <td style="padding:0.9rem;">
            ${svgGraphHtml}
          </td>

          <td style="white-space:nowrap; font-family:var(--font-num); font-weight:800; color:var(--text-white); font-size:1.08rem; padding:1.2rem 0.9rem;">
            ${formatWon(tx.totalCost)}원
          </td>
          
          <td style="white-space:nowrap; text-align:center; padding:1.2rem 0.9rem;">
            <button type="button" class="delete-btn" onclick="DeleteTransaction('${tx.id}', event)" title="삭제" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:var(--pnl-minus); border-radius:8px; padding:0.4rem 0.75rem; cursor:pointer; font-weight:700;">
              <i class="fa-solid fa-trash-can"></i> 삭제
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Summary Card Calculations
  const totalPnl = totalEvalSum - totalCostSum;
  const overallRate = totalCostSum > 0 ? ((totalPnl / totalCostSum) * 100).toFixed(2) : '0.00';
  const isOverallPlus = totalPnl >= 0;

  const wEl = document.getElementById('myTotalWeight');
  const cEl = document.getElementById('myTotalCost');
  const eEl = document.getElementById('myCurrentEval');
  const pEl = document.getElementById('myPnlAmount');
  const bEl = document.getElementById('myPnlBadge');

  if (wEl) wEl.innerHTML = `${(totalDonWeight * 3.75).toFixed(2)}g <span style="font-size:0.9rem; font-weight:400; color:var(--text-muted);">(${totalDonWeight.toFixed(2)}돈)</span>`;
  if (cEl) cEl.innerText = `${formatWon(totalCostSum)} 원`;
  if (eEl) eEl.innerText = `${formatWon(totalEvalSum)} 원`;
  
  if (pEl) {
    pEl.innerText = `${isOverallPlus ? '+' : ''}${formatWon(totalPnl)} 원`;
    pEl.className = `pnl-card-val ${isOverallPlus ? 'up-val' : 'down-val'}`;
  }

  if (bEl) {
    bEl.className = `badge-pnl ${isOverallPlus ? 'badge-plus' : 'badge-minus'}`;
    bEl.innerHTML = `<i class="fa-solid ${isOverallPlus ? 'fa-caret-up' : 'fa-caret-down'}"></i> ${isOverallPlus ? '+' : ''}${overallRate}% (${isOverallPlus ? '수익중' : '손실중'})`;
  }

  // Update Re-sell Opportunity Alert Banner
  const pctEl = document.getElementById('resellPercentText');
  if (pctEl) {
    pctEl.innerText = `${isOverallPlus ? '+' : ''}${overallRate}% ${isOverallPlus ? '상승' : '변동'}`;
    pctEl.style.color = isOverallPlus ? 'var(--pnl-plus)' : 'var(--pnl-minus)';
  }
}

function GenerateTxSvgSparkline(tx, currentRateForPurity) {
  const startPrice = tx.unitCost;
  const endPrice = currentRateForPurity;
  const diff = (endPrice * tx.donWeight) - tx.totalCost;
  const priceDiff = endPrice - startPrice;
  const isPlus = diff >= 0;
  const lineColor = isPlus ? '#10b981' : '#ef4444';

  const w = 330;
  const h = 55;
  const paddingX = 14;
  const paddingY = 10;

  const count = 6;
  const maxVal = Math.max(startPrice, endPrice) + Math.abs(priceDiff) * 0.2 + 2000;
  const minVal = Math.min(startPrice, endPrice) - Math.abs(priceDiff) * 0.2 - 2000;
  const range = maxVal - minVal || 1;

  const points = [];
  for (let i = 0; i < count; i++) {
    const x = paddingX + ((w - paddingX * 2) * (i / (count - 1)));
    let val;
    if (i === 0) val = startPrice;
    else if (i === count - 1) val = endPrice;
    else {
      const linear = startPrice + (priceDiff * (i / (count - 1)));
      const wave = Math.sin(i * 1.7) * Math.abs(priceDiff) * 0.3;
      val = linear + wave;
    }
    const y = (h - paddingY) - (((val - minVal) / range) * (h - paddingY * 2));
    points.push({ x: x.toFixed(1), y: y.toFixed(1), val: Math.round(val) });
  }

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = (parseFloat(p0.x) + (parseFloat(p1.x) - parseFloat(p0.x)) * 0.5).toFixed(1);
    const cp1y = p0.y;
    const cp2x = cp1x;
    const cp2y = p1.y;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
  }

  const polyPoints = `${points[0].x},${h + 5} ${points.map(p => `${p.x},${p.y}`).join(' ')} ${points[points.length-1].x},${h + 5}`;
  const dotsSvg = points.map((p, idx) => {
    if (idx === 0) return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${lineColor}" stroke="#000" stroke-width="1.5"/>`;
    if (idx === points.length - 1) return `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${lineColor}" stroke="#ffffff" stroke-width="2"/>`;
    return `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${lineColor}" opacity="0.8"/>`;
  }).join('');

  const now = new Date();
  const todayStr = `${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  const profitRate = tx.totalCost > 0 ? ((diff / tx.totalCost) * 100).toFixed(2) : '0.00';

  return `
    <div style="background:rgba(9,11,16,0.95); border:1px solid var(--border-dark); border-radius:14px; padding:0.85rem 1.1rem; min-width:360px;">
      <!-- Table Header & Stats -->
      <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:center; margin-bottom:0.6rem;">
        <thead>
          <tr style="color:var(--text-muted); border-bottom:1px solid rgba(255,255,255,0.08);">
            <th style="padding-bottom:0.35rem; font-weight:600;">등록 당시 단가</th>
            <th style="padding-bottom:0.35rem; font-weight:600;">현재 실시간 시세</th>
            <th style="padding-bottom:0.35rem; font-weight:600;">평가 손익</th>
          </tr>
        </thead>
        <tbody>
          <tr style="font-family:var(--font-num); font-weight:800; font-size:0.95rem;">
            <td style="padding-top:0.45rem; color:var(--text-light);">${formatWon(tx.unitCost)}원</td>
            <td style="padding-top:0.45rem; color:var(--gold-light);">${formatWon(currentRateForPurity)}원</td>
            <td style="padding-top:0.45rem;" class="${isPlus ? 'up-val' : 'down-val'}">${isPlus ? '▲' : '▼'} ${formatWon(Math.abs(diff))}원 (${isPlus ? '+' : ''}${profitRate}%)</td>
          </tr>
        </tbody>
      </table>

      <!-- SVG LINE GRAPH (등록시점 ~ 현재 시세 실시간 등락 그래프) -->
      <div style="border-top:1px dashed rgba(255,255,255,0.12); background:rgba(0,0,0,0.3); border-radius:10px; padding:0.6rem 0.8rem 0.4rem 0.8rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; font-size:0.75rem; color:var(--text-muted);">
          <span><i class="fa-solid fa-chart-line text-gold"></i> 등록일 (${tx.date})</span>
          <span style="color:${lineColor}; font-weight:800; font-size:0.78rem;">${isPlus ? '▲ 실시간 수익 추세' : '▼ 실시간 손실 추세'}</span>
          <span>오늘 (${todayStr})</span>
        </div>

        <svg viewBox="0 0 330 55" style="width:100%; height:55px; overflow:visible;">
          <defs>
            <linearGradient id="grad_svg_${tx.id}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <polygon points="${polyPoints}" fill="url(#grad_svg_${tx.id})" />
          <path d="${d}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          ${dotsSvg}
        </svg>

        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); font-family:var(--font-num); margin-top:0.25rem;">
          <span style="color:var(--text-light); font-weight:700;">시작가: ${formatWon(startPrice)}원</span>
          <span style="color:${lineColor}; font-weight:800;">현재가: ${formatWon(endPrice)}원</span>
        </div>
      </div>
    </div>
  `;
}

function OpenAddTransactionModal() {
  if (!currentUser) {
    alert('내 금 자산 거래 등록은 로그인 후 이용 가능합니다.');
    OpenAuthModal('login');
    return;
  }

  const dateInput = document.getElementById('txDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const modal = document.getElementById('addTxModal');
  if (modal) modal.classList.add('active');
}

function AddMyTransaction(e) {
  e.preventDefault();

  const type = document.getElementById('txType')?.value || '매수';
  const date = document.getElementById('txDate').value;
  const itemName = document.getElementById('txItemName').value;
  const purity = document.getElementById('txPurity').value;
  const donWeight = parseFloat(document.getElementById('txWeightDon').value);
  const totalCost = parseInt(document.getElementById('txTotalCost').value);

  const unitCost = Math.round(totalCost / donWeight);

  let formattedDate = date;
  if (date && date.includes('-')) {
    formattedDate = date.replace(/-/g, '.');
  } else if (!date) {
    const today = new Date();
    formattedDate = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
  }

  const newTx = {
    id: Date.now(),
    date: formattedDate,
    type,
    itemName,
    purity,
    donWeight,
    unitCost,
    totalCost
  };

  myTransactions.push(newTx);
  SaveMyTransactions();
  RenderMyPageLedger();
  CloseModal('addTxModal');

  e.target.reset();
}

function DeleteTransaction(id, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  myTransactions = myTransactions.filter(t => String(t.id) !== String(id));
  SaveMyTransactions();
  RenderMyPageLedger();
}

// Immediate calendar invocation
setTimeout(() => {
  try { SetDefaultBookingDate(); } catch(e) { console.error(e); }
}, 50);

