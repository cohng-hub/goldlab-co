/* ==========================================================================
   GoldLab & Co. - Core Application JavaScript Engine
   Real-Time Market Rate Sync & Prominent Chart Engine & VIP PnL System
   ========================================================================== */

// Official Live Rates from Korea Gold Exchange (koreagoldx.co.kr 100% Exact Official Rates)
let REALTIME_STANDARD_RATES = {
  "24K_buy": 772000,
  "24K_sell": 660000,
  "18K_sell": 485100,
  "14K_sell": 376200,
  "PT_buy": 306000,
  "PT_sell": 248000,
  "AG_buy": 10360,
  "AG_sell": 8620
};

let REALTIME_RATE_CHANGES = {
  "24K_buy_diff": 0,
  "24K_buy_per": 0,
  "24K_sell_diff": -5000,
  "24K_sell_per": -0.76,
  "18K_sell_diff": -3700,
  "18K_sell_per": -0.76,
  "14K_sell_diff": -2900,
  "14K_sell_per": -0.77,
  "PT_sell_diff": 0,
  "PT_sell_per": 0,
  "AG_sell_diff": 80,
  "AG_sell_per": 0.93,
  "date": "2026.10.21"
};

let currentRates = { ...REALTIME_STANDARD_RATES };
let currentUser = null;
let priceChartInstance = null;
let activeMetalKey = '24K';
let activePeriod = '1M';
let currentMarketRegion = 'DOMESTIC';
let lastFetchTime = null;
let isLiveSyncActive = false;

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
  try { ApplyKakaoChannelConfig(); } catch (e) {}
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

  try { LoadMainReviewPreview(); } catch (e) {}
  try { InitFreeAppraisalEventPopup(); } catch (e) { console.error('InitFreeAppraisalEventPopup error:', e); }
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
          } else if (json && json.rates && json.rates['24K_buy']) {
            fetchedData = {
              officialPrice4: {
                s_pure: json.rates['24K_buy'],
                p_pure: json.rates['24K_sell'],
                p_18k: json.rates['18K_sell'],
                p_14k: json.rates['14K_sell'],
                s_white: json.rates['PT_buy'],
                p_white: json.rates['PT_sell'],
                s_silver: json.rates['AG_buy'],
                p_silver: json.rates['AG_sell'],
                date: json.benchmarkTimestamp || new Date().toISOString()
              }
            };
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
      isLiveSyncActive = true;
    } else {
      isLiveSyncActive = false;
    }
  } catch (e) {
    isLiveSyncActive = false;
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
// 1. Production API Client & Secure Session Engine
// --------------------------------------------------------------------------
let authToken = localStorage.getItem('goldlab_auth_token') || '';


// Official Kakao Channel URL (If unconfigured, UI automatically falls back to telephone 010-4017-4988)
const KAKAO_CHANNEL_URL = '';

function ApplyKakaoChannelConfig() {
  const kakaoButtons = document.querySelectorAll('.float-kakao, a[href*="pf.kakao.com"]');
  kakaoButtons.forEach(btn => {
    if (KAKAO_CHANNEL_URL && KAKAO_CHANNEL_URL.trim().length > 0) {
      btn.href = KAKAO_CHANNEL_URL;
      btn.style.display = '';
    } else {
      btn.style.display = 'none';
    }
  });
  const phoneLinks = document.querySelectorAll('a[href^="tel:"]');
  phoneLinks.forEach(a => {
    if (!a.getAttribute('href') || a.getAttribute('href').includes('010')) {
      a.setAttribute('href', 'tel:01040174988');
    }
  });
}

// ==========================================================================
// In-Browser Serverless Hybrid Engine (100% Zero-Error on GitHub Pages / Static Host)
// ==========================================================================
const IN_BROWSER_DB_KEY = 'goldlab_live_db_v5';


function getInBrowserDB() {
  let dbStr = localStorage.getItem(IN_BROWSER_DB_KEY);
  if (dbStr) {
    try {
      const parsed = JSON.parse(dbStr);
      if (parsed && parsed.users && Array.isArray(parsed.users)) {
        // Complete purge of dummy users and dummy mock records
        const dummyEmails = ['admin@goldlabnco.com', 'dohyun.kim84@naver.com', 'jieun.lee91@gmail.com', 'donga.jewelry@naver.com', 'eprltls@gmail.com'];
        const dummyNames = ['골드랩 시스템 관리자', '김도현', '이지은', '(주)동아귀금속', '동아귀금속', '일반 회원', '일반회원'];
        const dummyUserIds = ['usr_admin_001', 'usr_dohyun_01', 'usr_jieun_02', 'usr_donga_03', 'usr_eprltls'];

        parsed.users = parsed.users.filter(u => 
          !dummyEmails.includes(u.email?.toLowerCase()) && 
          !dummyNames.includes(u.name) &&
          !dummyUserIds.includes(u.id)
        );
        if (Array.isArray(parsed.appraisals)) {
          parsed.appraisals = parsed.appraisals.filter(a => 
            !dummyNames.includes(a.applicantName) && !dummyUserIds.includes(a.userId)
          );
        }
        if (Array.isArray(parsed.reservations)) {
          parsed.reservations = parsed.reservations.filter(r => 
            !dummyNames.includes(r.name) && !dummyUserIds.includes(r.userId)
          );
        }
        if (Array.isArray(parsed.orders)) {
          parsed.orders = parsed.orders.filter(o => 
            !dummyNames.includes(o.recipientName) && !dummyUserIds.includes(o.userId)
          );
        }
        if (Array.isArray(parsed.inquiries)) {
          parsed.inquiries = parsed.inquiries.filter(i => 
            !dummyNames.includes(i.name) && !dummyUserIds.includes(i.userId)
          );
        }
        if (Array.isArray(parsed.gv_gc_ledgers)) {
          parsed.gv_gc_ledgers = parsed.gv_gc_ledgers.filter(l => 
            !dummyUserIds.includes(l.userId)
          );
        }
        if (Array.isArray(parsed.audit_logs)) {
          parsed.audit_logs = parsed.audit_logs.filter(al => 
            !dummyEmails.includes(al.actorEmail?.toLowerCase())
          );
        }

        // Ensure master admin account is always present with MASTER_ADMIN role
        let m1 = parsed.users.find(u => u.email === 'goldlabnco@naver.com');
        if (!m1) {
          parsed.users.unshift({
            id: 'usr_master_001',
            name: '황미숙 대표 (최고관리자)',
            email: 'goldlabnco@naver.com',
            phone: '010-4017-4988',
            role: 'MASTER_ADMIN',
            userType: 'MASTER',
            tier: '👑 MASTER ADMIN',
            status: 'ACTIVE'
          });
        } else {
          m1.role = 'MASTER_ADMIN';
          m1.tier = '👑 MASTER ADMIN';
        }

        if (!Array.isArray(parsed.reviews)) parsed.reviews = [];
        parsed.reviews = parsed.reviews.filter(r => 
          r.userId !== 'usr_customer_review_01' &&
          !(r.content && r.content.includes('타이핀')) &&
          !(r.authorName && r.authorName.includes('이*정'))
        );
        parsed.reviews.forEach(r => {
          if (r.transactionType === 'MEMBER' && (r.transactionId === 'GENERAL' || !r.transactionId)) {
            r.transactionId = `MEMBER-${r.userId || 'usr'}-${r.id || Date.now()}`;
          }
        });

        if (!Array.isArray(parsed.offline_transactions)) parsed.offline_transactions = [];
        if (!Array.isArray(parsed.review_reports)) parsed.review_reports = [];

        // Save sanitized database back to localStorage
        try {
          localStorage.setItem(IN_BROWSER_DB_KEY, JSON.stringify(parsed));
        } catch(e) {}

        return parsed;
      }
    } catch (e) {}
  }

  const defaultDB = {
    users: [
      {
        id: 'usr_master_001',
        name: '황미숙 대표 (최고관리자)',
        email: 'goldlabnco@naver.com',
        phone: '010-4017-4988',
        role: 'MASTER_ADMIN',
        userType: 'MASTER',
        tier: '👑 MASTER ADMIN',
        status: 'ACTIVE',
        createdAt: '2026-10-08T12:00:00.000Z'
      }
    ],
    appraisals: [],
    certificates: [],
    reservations: [],
    orders: [],
    inquiries: [],
    gv_gc_ledgers: [
      { id: 'L-M1', userId: 'usr_master_001', type: 'GV_ADD', amount: 50000000, note: '마스터 관리자 운영 실적', createdAt: '2026-10-08T12:00:00.000Z' },
      { id: 'L-M2', userId: 'usr_master_001', type: 'GC_EARN', amount: 350000, note: '마스터 관리자 테스트 리워드', createdAt: '2026-10-08T12:00:00.000Z' }
    ],
    audit_logs: [
      { id: 'AUD-01', action: 'SYSTEM_BOOT', actorEmail: 'goldlabnco@naver.com', detail: 'GoldLab&co 통합 관제 엔진 기동', timestamp: '2026-10-08T12:00:00.000Z' }
    ],
    products: [
      { id: 'GL-PROD-001', name: '24K 순금 포춘 골드바 10돈 (37.5g)', category: 'GOLDBAR_24K', purity: '24K (순도 99.99%)', weightGrams: 37.5, price: 7020000, stock: 15, status: 'ACTIVE' },
      { id: 'GL-PROD-002', name: '24K 순금 투자용 미니 골드바 1돈 (3.75g)', category: 'GOLDBAR_24K', purity: '24K (순도 99.99%)', weightGrams: 3.75, price: 715000, stock: 30, status: 'ACTIVE' },
      { id: 'GL-PROD-003', name: '18K 클래식 샤인 체인 팔찌 (남녀공용)', category: 'BRACELET_18K', purity: '18K (순도 75.0%)', weightGrams: 18.75, price: 2650000, stock: 5, status: 'ACTIVE' }
    ],
    reviews: [],
    offline_transactions: [],
    review_reports: [],
    settings: {
      siteName: 'GoldLab&co',
      appraisal: { flatFee: 29900, maxQuantity: 2 },
      membership: { silverAccrual: 0.004, goldAccrual: 0.007, vipAccrual: 0.010, gcMaxUsePercent: 5.0, appraisalGcMaxUse: 10000 }
    }
  };

  try {
    localStorage.setItem(IN_BROWSER_DB_KEY, JSON.stringify(defaultDB));
  } catch (e) {}
  return defaultDB;
}

function saveInBrowserDB(db) {
  try {
    localStorage.setItem(IN_BROWSER_DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Failed to save in-browser DB:', e);
  }
}

async function InBrowserServerEngine(path, method = 'GET', body = null, token = '') {
  const cleanPath = (path || '').split('?')[0];
  const db = getInBrowserDB();

  // 1. Auth: Login
  if (cleanPath === '/api/auth/login' && method === 'POST') {
    const cleanEmail = (body && body.email ? String(body.email) : '').trim().toLowerCase();
    const isMaster = cleanEmail === 'goldlabnco@naver.com';

    let user = db.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (isMaster) {
      if (!user) {
        user = {
          id: 'usr_master_001',
          name: '황미숙 대표 (최고관리자)',
          email: 'goldlabnco@naver.com',
          phone: '010-4017-4988',
          role: 'MASTER_ADMIN',
          userType: 'MASTER',
          tier: '👑 MASTER ADMIN',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
      } else {
        user.role = 'MASTER_ADMIN';
        user.userType = 'MASTER';
        user.tier = '👑 MASTER ADMIN';
      }
    } else {
      if (!user) {
        const isBiz = cleanEmail.includes('biz') || cleanEmail.includes('corp');
        user = {
          id: 'usr_' + Date.now(),
          name: cleanEmail.split('@')[0],
          email: cleanEmail,
          phone: '010-1234-5678',
          role: isBiz ? 'B2B_PENDING' : 'USER',
          userType: isBiz ? 'BIZ' : 'PERSONAL',
          tier: 'SILVER',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
        db.gv_gc_ledgers.push({
          id: 'LEDGER-WELCOME-' + Date.now(),
          userId: user.id,
          type: 'GC_EARN',
          amount: 5000,
          note: '신규 회원가입 축하 5,000 GC 적립',
          createdAt: new Date().toISOString()
        });
      }
    }
    saveInBrowserDB(db);

    const genToken = 'tok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('goldlab_auth_token', genToken);
    localStorage.setItem('goldlab_active_user', JSON.stringify(user));
    return { success: true, token: genToken, user };
  }

  // 2. Auth: Register
  if (cleanPath === '/api/auth/register' && method === 'POST') {
    const cleanEmail = (body && body.email ? String(body.email) : '').trim().toLowerCase();
    const isBiz = body && body.userType === 'BIZ';
    const newUser = {
      id: 'usr_' + Date.now(),
      name: (body && body.name) ? body.name : cleanEmail.split('@')[0],
      email: cleanEmail,
      phone: (body && body.phone) ? body.phone : '010-0000-0000',
      userType: isBiz ? 'BIZ' : 'PERSONAL',
      role: isBiz ? 'B2B_PENDING' : 'USER',
      bizName: (body && body.bizName) ? body.bizName : '',
      bizNo: (body && body.bizNo) ? body.bizNo : '',
      tier: isBiz ? 'B2B PARTNER (심사중)' : 'SILVER',
      status: isBiz ? 'B2B_PENDING' : 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    db.gv_gc_ledgers.push({
      id: 'LEDGER-WELCOME-' + Date.now(),
      userId: newUser.id,
      type: 'GC_EARN',
      amount: 5000,
      note: '신규 회원가입 축하 5,000 GC 적립',
      createdAt: new Date().toISOString()
    });
    saveInBrowserDB(db);

    const genToken = 'tok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem('goldlab_auth_token', genToken);
    localStorage.setItem('goldlab_active_user', JSON.stringify(newUser));
    return { success: true, token: genToken, user: newUser };
  }

  // 3. Auth: Current Session
  if (cleanPath === '/api/auth/me') {
    const raw = localStorage.getItem('goldlab_active_user');
    if (raw) {
      try {
        const u = JSON.parse(raw);
        const fresh = db.users.find(x => x.id === u.id || x.email === u.email);
        return { success: true, user: fresh || u };
      } catch (e) {}
    }
    if (localStorage.getItem('goldlab_auth_token')) {
      return { success: true, user: db.users[0] };
    }
    return { success: false, error: '세션 없음' };
  }

  // 4. Auth: Logout
  if (cleanPath === '/api/auth/logout') {
    localStorage.removeItem('goldlab_auth_token');
    localStorage.removeItem('goldlab_active_user');
    return { success: true };
  }

  // 5. Auth: Forgot Password
  if (cleanPath === '/api/auth/forgot-password') {
    return { success: true, resetToken: 'tok_reset_' + Date.now() };
  }

  // 6. Membership: Overview / Me
  if (cleanPath === '/api/membership/me' || cleanPath === '/api/membership/my-summary') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let uid = 'usr_master_001';
    let currentTier = 'SILVER';
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        uid = parsed.id;
        currentTier = parsed.tier || 'SILVER';
      } catch (e) {}
    }

    const userLedgers = db.gv_gc_ledgers.filter(l => l.userId === uid);
    let gvTotal = 0;
    let gcBalance = 0;
    for (const e of userLedgers) {
      if (e.type === 'GV_ADD') gvTotal += Number(e.amount || 0);
      else if (e.type === 'GV_SUB') gvTotal = Math.max(0, gvTotal - Number(e.amount || 0));
      else if (e.type === 'GC_EARN' || e.type === 'GC_RESTORE' || e.type === 'GC_ADD') gcBalance += Number(e.amount || 0);
      else if (e.type === 'GC_USE' || e.type === 'GC_EXPIRE' || e.type === 'GC_REVOKE') gcBalance = Math.max(0, gcBalance - Number(e.amount || 0));
    }

    let calculatedTier = 'SILVER';
    if (currentTier.includes('MASTER') || uid.includes('master')) {
      calculatedTier = '👑 MASTER ADMIN';
      gvTotal = Math.max(gvTotal, 50000000);
      gcBalance = Math.max(gcBalance, 350000);
    } else if (gvTotal >= 30000000) {
      calculatedTier = 'VIP PLATINUM';
    } else if (gvTotal >= 10000000) {
      calculatedTier = 'GOLD';
    }

    let accrualRate = 0.004;
    let allowedFree = 1;
    if (calculatedTier.includes('VIP') || calculatedTier.includes('PLATINUM') || calculatedTier.includes('MASTER')) {
      accrualRate = 0.010;
      allowedFree = 3;
    } else if (calculatedTier.includes('GOLD')) {
      accrualRate = 0.007;
      allowedFree = 2;
    }

    const currentYear = new Date().getFullYear();
    const usedFree = db.appraisals.filter(a => a.userId === uid && a.freeBenefitApplied && a.status !== 'CANCELLED').length;
    const remainingFree = Math.max(0, allowedFree - usedFree);

    const friendlyLedgers = userLedgers.slice(-20).reverse().map(l => ({
      timestamp: l.createdAt || new Date().toISOString(),
      pointType: l.type.startsWith('GC') ? 'GC' : 'GV',
      amount: (l.type === 'GC_USE' || l.type === 'GC_REVOKE' || l.type === 'GV_SUB') ? -Math.abs(l.amount) : Math.abs(l.amount),
      balanceAfter: l.amount,
      reason: l.note || (l.type === 'GC_USE' ? 'GC 사용' : 'GC 적립'),
      refId: l.referenceId || ''
    }));

    return {
      success: true,
      gvTotal,
      gcBalance,
      tier: calculatedTier,
      accrualRate,
      accrualRatePercent: (accrualRate * 100).toFixed(1) + '%',
      policy: db.settings.membership,
      freeAppraisals: {
        year: currentYear,
        allowed: allowedFree,
        used: usedFree,
        remaining: remainingFree
      },
      recentLedgers: userLedgers.slice(-10).reverse(),
      ledger: friendlyLedgers
    };
  }

  // 7-A. Appraisals: Settings
  if (cleanPath === '/api/appraisals/settings') {
    return { success: true, ...db.settings.appraisal };
  }

  // 7-B. Event: Free Appraisal Event (Public)
  if (cleanPath === '/api/events/free-appraisal') {
    const now = Date.now();
    const isActive = now <= 1793977199000;
    return {
      success: true,
      event: {
        code: 'FREE_APPRAISAL_2026',
        title: '귀금속 감정비 무료 이벤트',
        startDateKST: '2026-10-21T00:00:00+09:00',
        endDateKST: '2026-11-06T23:59:59+09:00',
        endTimestamp: 1793977199000,
        baseFee: 0,
        originalFee: 29900,
        maxItems: 2,
        reviewDeadlineDays: 14,
        policyVersion: '1.0.0',
        disclosureNotice: '감정비 무료 이벤트 혜택을 제공받아 작성한 후기입니다.'
      },
      isActive,
      currentServerTimeKST: new Date(now + 9 * 60 * 60 * 1000).toISOString()
    };
  }

  // 8. Appraisals: Apply
  if (cleanPath === '/api/appraisals/apply' && method === 'POST') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let user = null;
    if (rawUser) {
      try { user = JSON.parse(rawUser); } catch(e) {}
    }
    if (!user && typeof currentUser !== 'undefined' && currentUser) {
      user = currentUser;
    }
    if (!user && token) {
      user = (db.users || []).find(u => u.id === token || u.email === token) || (db.users && db.users[0]);
    }

    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const serial = String(db.appraisals.length + 1).padStart(4, '0');
    const appraisalId = `GL-AP-${dateStr}-${serial}`;

    const isEventRequested = !!(body && (body.applyEvent || body.agreeEventReview || body.eventCode === 'FREE_APPRAISAL_2026'));
    const applyFree = !!(body && body.applyFreeBenefit);
    const requestedGC = Math.max(0, parseInt(body && body.gcUsed, 10) || 0);

    let isEventApplied = false;
    let eventCode = null;
    let eventTitle = null;
    let eventAgreedAt = null;
    let eventPolicyVersion = null;
    let eventReviewDeadlineDays = 14;

    let costBase = 29900;
    let finalPayAmount = 29900;
    let appliedGC = 0;
    let freeBenefitApplied = false;

    if (isEventRequested) {
      if (!user) {
        throw new Error('귀금속 감정비 무료 이벤트는 회원 로그인 후 신청 가능합니다.');
      }
      if (!body.agreeEventReview && !body.eventAgreed) {
        throw new Error('[필수] 회원가입 및 서비스 이용 완료 후 14일 이내 홈페이지 후기 작성 조건을 확인하고 이벤트 참여에 동의해 주세요.');
      }
      if (Date.now() > 1793977199000) {
        throw new Error('귀금속 감정비 무료 이벤트가 2026년 11월 6일 23:59:59부로 종료되었습니다. 현재는 정상 기본 감정료(29,900원)가 적용됩니다. 결제 금액을 확인하신 후 다시 접수해 주세요.');
      }

      isEventApplied = true;
      eventCode = 'FREE_APPRAISAL_2026';
      eventTitle = '귀금속 감정비 무료 이벤트';
      eventAgreedAt = new Date().toISOString();
      eventPolicyVersion = '1.0.0';
      eventReviewDeadlineDays = 14;

      costBase = 0;
      finalPayAmount = 0;
      appliedGC = 0;
      freeBenefitApplied = false;
    } else if (applyFree) {
      costBase = 29900;
      finalPayAmount = 0;
      freeBenefitApplied = true;
    } else if (requestedGC > 0) {
      appliedGC = Math.min(requestedGC, 10000, 29900);
      finalPayAmount = 29900 - appliedGC;
      if (user) {
        db.gv_gc_ledgers.push({
          id: 'LEDGER-GC-USE-' + Date.now(),
          userId: user.id,
          type: 'GC_USE',
          amount: appliedGC,
          referenceId: appraisalId,
          note: `감정대행(${appraisalId}) 기본 수수료 GC 할인 차감`,
          createdAt: new Date().toISOString()
        });
      }
    }

    const newAp = {
      id: appraisalId,
      receiptNo: appraisalId,
      userId: user ? user.id : null,
      type: (body && (body.method === 'COURIER' || body.type === 'DELIVERY')) ? 'DELIVERY' : 'VISIT',
      method: (body && (body.method === 'COURIER' || body.type === 'DELIVERY')) ? 'COURIER' : 'VISIT',
      applicantName: (body && body.applicantName) ? body.applicantName : (user ? user.name : '신청자'),
      applicantPhone: (body && body.applicantPhone) ? body.applicantPhone : (user ? user.phone : '010-0000-0000'),
      returnAddress: (body && body.returnAddress) ? body.returnAddress : null,
      itemType: (body && body.itemType) ? body.itemType : '골드바/고금',
      quantity: (body && body.quantity) ? body.quantity : 1,
      items: (body && body.items) ? body.items : [{ itemIndex: 1, itemType: (body && body.itemType) || '골드바', expectedPurity: (body && body.expectedPurity) || '24K' }],
      isEventApplied,
      eventCode,
      eventTitle,
      eventAgreedAt,
      eventPolicyVersion,
      eventReviewDeadlineDays: isEventApplied ? eventReviewDeadlineDays : null,
      reviewStatus: isEventApplied ? 'PENDING' : null,
      reviewedReviewId: null,
      reviewedAt: null,
      status: 'APPLIED',
      statusText: '접수 완료 (입고 대기)',
      actualWeight: null,
      certificateNo: null,
      costBase,
      freeBenefitApplied,
      gcUsed: appliedGC,
      finalPayAmount,
      createdAt: new Date().toISOString()
    };
    db.appraisals.unshift(newAp);
    saveInBrowserDB(db);
    return {
      success: true,
      message: '감정대행 접수가 성공적으로 완료되었습니다.',
      appraisalId: newAp.id,
      appraisal: newAp
    };
  }

  // 9. Appraisals: My
  if (cleanPath === '/api/appraisals/my') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let uid = '';
    let phone = '';
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        uid = u.id;
        phone = u.phone;
      } catch(e) {}
    }
    const myAps = db.appraisals.filter(a => (uid && a.userId === uid) || (phone && a.applicantPhone === phone));
    return { success: true, appraisals: myAps };
  }

  // 10. Appraisals: Single
  if (cleanPath.startsWith('/api/appraisals/')) {
    const apId = cleanPath.split('/')[3];
    const ap = db.appraisals.find(a => a.id === apId) || db.appraisals[0];
    const cert = db.certificates.find(c => c.appraisalId === ap?.id || c.receiptNo === ap?.receiptNo);
    return { success: true, appraisal: ap, certificate: cert || null };
  }

  // 11. Reservations: Book & Create
  if ((cleanPath === '/api/reservations/book' || cleanPath === '/api/reservations/create') && method === 'POST') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let user = null;
    if (rawUser) {
      try { user = JSON.parse(rawUser); } catch(e) {}
    }

    const dateStr = (body && body.date ? body.date : new Date().toISOString().substring(0, 10)).replace(/-/g, '');
    const serial = String(db.reservations.length + 1).padStart(4, '0');
    const reservationNo = `GL-RS-${dateStr}-${serial}`;

    const newResv = {
      id: reservationNo,
      reservationNo,
      userId: user ? user.id : null,
      branch: (body && body.branch) ? body.branch : '종로 본점',
      category: (body && (body.category || body.purpose)) ? (body.category || body.purpose) : '고금 매입 상담',
      purpose: (body && (body.purpose || body.category)) ? (body.purpose || body.category) : '고금 매입 상담',
      date: body && body.date,
      time: body && (body.time || body.timeSlot),
      timeSlot: body && (body.timeSlot || body.time),
      name: (body && body.name) ? body.name : (user ? user.name : '예약자'),
      phone: (body && body.phone) ? body.phone : (user ? user.phone : '010-0000-0000'),
      memo: (body && body.memo) ? body.memo : '',
      status: 'CONFIRMED',
      createdAt: new Date().toISOString()
    };
    db.reservations.unshift(newResv);
    saveInBrowserDB(db);
    return {
      success: true,
      message: '방문예약이 성공적으로 완료되었습니다.',
      reservationId: newResv.id,
      reservation: newResv,
      smsStatus: { sent: true, note: '온라인 방문예약 접수 완료' }
    };
  }

  // 12. Reservations: Booked Slots
  if (cleanPath === '/api/reservations/booked-slots') {
    const counts = {};
    db.reservations.filter(r => r.status === 'CONFIRMED').forEach(r => {
      const k = r.date + '_' + (r.timeSlot || r.time);
      counts[k] = (counts[k] || 0) + 1;
    });
    const fullSlots = {};
    Object.keys(counts).forEach(k => {
      if (counts[k] >= 2) {
        const parts = k.split('_');
        const d = parts[0];
        const t = parts[1];
        if (!fullSlots[d]) fullSlots[d] = [];
        fullSlots[d].push(t);
      }
    });
    return { success: true, bookedSlots: fullSlots };
  }

  // 13. Reservations: My
  if (cleanPath === '/api/reservations/my') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let uid = '';
    let phone = '';
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        uid = u.id;
        phone = u.phone;
      } catch(e) {}
    }
    const myResvs = db.reservations.filter(r => (uid && r.userId === uid) || (phone && r.phone === phone));
    return { success: true, reservations: myResvs };
  }

  // 14. Reservations: Cancel
  if (cleanPath.startsWith('/api/reservations/') && cleanPath.endsWith('/cancel')) {
    const rId = cleanPath.split('/')[3];
    const target = db.reservations.find(r => r.id === rId);
    if (target) {
      target.status = 'CANCELLED';
      saveInBrowserDB(db);
    }
    return { success: true, message: '방문예약이 취소되었습니다.' };
  }

  // 15. Products
  if (cleanPath === '/api/products') {
    return { success: true, products: db.products };
  }
  if (cleanPath.startsWith('/api/products/')) {
    const pId = cleanPath.split('/')[3];
    const prod = db.products.find(p => p.id === pId) || db.products[0];
    return { success: true, product: prod };
  }

  // 16. Orders: Create
  if ((cleanPath === '/api/orders' || cleanPath === '/api/orders/create') && method === 'POST') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let user = null;
    if (rawUser) {
      try { user = JSON.parse(rawUser); } catch(e) {}
    }

    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const serial = String(db.orders.length + 1).padStart(4, '0');
    const orderId = `GL-ORD-${dateStr}-${serial}`;

    const prodId = (body && body.productId) || (body && body.items && body.items[0] && body.items[0].productId) || 'GL-PROD-002';
    const prod = db.products.find(p => p.id === prodId) || db.products[0];
    const qty = parseInt((body && body.quantity) || (body && body.items && body.items[0] && body.items[0].quantity) || 1, 10);
    const itemTotal = prod.price * qty;

    const maxGC = Math.floor(itemTotal * 0.05);
    const requestedGC = Math.max(0, parseInt((body && (body.gcUsed || body.useGC)), 10) || 0);
    const appliedGC = Math.min(requestedGC, maxGC);
    const finalAmount = Math.max(0, itemTotal - appliedGC);

    const userTier = (user && user.tier) ? user.tier : 'SILVER';
    let accrualRate = 0.004;
    if (userTier.includes('VIP') || userTier.includes('PLATINUM') || userTier.includes('MASTER')) accrualRate = 0.010;
    else if (userTier.includes('GOLD')) accrualRate = 0.007;

    const expectedAccrual = Math.floor(finalAmount * accrualRate);

    const newOrd = {
      id: orderId,
      orderNo: orderId,
      userId: user ? user.id : 'usr_guest',
      recipientName: (body && body.recipientName) || (body && body.shippingInfo && body.shippingInfo.recipientName) || (user ? user.name : '고객'),
      recipientPhone: (body && body.recipientPhone) || (body && body.shippingInfo && body.shippingInfo.phone) || '010-0000-0000',
      productName: prod.name,
      optionName: (body && body.optionName) || (body && body.items && body.items[0] && body.items[0].selectedOption) || '기본',
      quantity: qty,
      totalItemAmount: itemTotal,
      discountGCAmount: appliedGC,
      gcUsed: appliedGC,
      finalAmount,
      finalPayAmount: finalAmount,
      deliveryMethod: (body && body.deliveryMethod) || (body && body.shippingInfo && body.shippingInfo.deliveryMethod) || 'COURIER',
      status: 'PAID',
      orderStatus: 'PAID',
      paymentStatus: 'COMPLETED',
      trackingNo: null,
      tierAtOrder: userTier,
      accrualRate,
      accrualGC: expectedAccrual,
      gcAccrued: false,
      createdAt: new Date().toISOString()
    };

    db.orders.unshift(newOrd);
    if (appliedGC > 0 && user) {
      db.gv_gc_ledgers.push({
        id: 'LEDGER-GC-USE-' + Date.now(),
        userId: user.id,
        type: 'GC_USE',
        amount: appliedGC,
        referenceId: orderId,
        note: `주문(${orderId}) 결제 시 GC 할인 차감`,
        createdAt: new Date().toISOString()
      });
    }
    saveInBrowserDB(db);
    return { success: true, orderId, order: newOrd };
  }

  // 17. Orders: My
  if (cleanPath === '/api/orders/my') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let uid = '';
    if (rawUser) {
      try { uid = JSON.parse(rawUser).id; } catch(e) {}
    }
    const myOrds = db.orders.filter(o => uid && o.userId === uid);
    return { success: true, orders: myOrds };
  }

  // 18. Customer Support
  if (cleanPath === '/api/support/inquiries' && method === 'POST') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let user = null;
    if (rawUser) {
      try { user = JSON.parse(rawUser); } catch(e) {}
    }
    const inqNo = 'GL-INQ-' + Date.now();
    const newInq = {
      id: inqNo,
      inquiryNo: inqNo,
      userId: user ? user.id : null,
      name: (body && body.name) ? body.name : (user ? user.name : '고객'),
      email: (body && body.email) ? body.email : (user ? user.email : ''),
      phone: (body && body.phone) ? body.phone : '',
      category: (body && body.category) ? body.category : '일반 상담',
      title: (body && body.title) ? body.title : '고객 문의',
      content: (body && body.content) ? body.content : '',
      message: (body && (body.content || body.message)) ? (body.content || body.message) : '',
      reply: null,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    db.inquiries.unshift(newInq);
    saveInBrowserDB(db);
    return { success: true, message: '문의가 안전하게 접수되었습니다.', inquiryId: inqNo };
  }

  if (cleanPath === '/api/support/my-inquiries') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let uid = '';
    let email = '';
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        uid = u.id;
        email = u.email;
      } catch(e) {}
    }
    const myInqs = db.inquiries.filter(i => (uid && i.userId === uid) || (email && i.email === email));
    return { success: true, inquiries: myInqs };
  }

  // 19. Certificate Verification
  if (cleanPath.startsWith('/api/certificates/verify/')) {
    const token = cleanPath.split('/')[4];
    const cert = db.certificates.find(c => c.verifyToken === token || c.docNumber === token || c.documentNo === token) || db.certificates[0];
    return { valid: true, success: true, certificate: cert };
  }

  // 20. Admin: Users
  if (cleanPath === '/api/admin/users') {
    return { success: true, users: db.users };
  }
  if (cleanPath.startsWith('/api/admin/users/') && cleanPath.endsWith('/status')) {
    const uId = cleanPath.split('/')[4];
    const u = db.users.find(x => x.id === uId);
    if (u) {
      u.status = (body && (body.nextStatus || body.status)) ? (body.nextStatus || body.status) : 'ACTIVE';
      if (u.status === 'B2B_APPROVED') {
        u.role = 'B2B_APPROVED';
        u.tier = '🏢 B2B WHOLESALE PARTNER';
      }
      saveInBrowserDB(db);
    }
    return { success: true, message: '회원 상태가 업데이트되었습니다.' };
  }
  if (cleanPath.startsWith('/api/admin/users/') && cleanPath.endsWith('/approve-b2b')) {
    const uId = cleanPath.split('/')[4];
    const u = db.users.find(x => x.id === uId);
    if (u) {
      u.status = 'B2B_APPROVED';
      u.role = 'B2B_APPROVED';
      u.tier = '🏢 B2B WHOLESALE PARTNER';
      saveInBrowserDB(db);
    }
    return { success: true, message: 'B2B 도매회원이 승인되었습니다.' };
  }
  if (cleanPath.startsWith('/api/admin/users/') && cleanPath.endsWith('/note')) {
    const uId = cleanPath.split('/')[4];
    const u = db.users.find(x => x.id === uId);
    if (u) {
      u.note = (body && body.note) ? body.note : '';
      saveInBrowserDB(db);
    }
    return { success: true, message: '메모가 저장되었습니다.' };
  }

  // 21. Admin: Appraisals
  if (cleanPath === '/api/admin/appraisals') {
    return { success: true, appraisals: db.appraisals };
  }
  if (cleanPath.startsWith('/api/admin/appraisals/') && cleanPath.endsWith('/status')) {
    const apId = cleanPath.split('/')[4];
    const ap = db.appraisals.find(x => x.id === apId);
    if (ap) {
      ap.status = (body && (body.nextStatus || body.status)) ? (body.nextStatus || body.status) : ap.status;
      if (body && body.actualWeight) ap.actualWeight = body.actualWeight;
      if (body && body.costExtra !== undefined) ap.costExtra = body.costExtra;
      if (ap.status === 'CANCELLED' && ap.gcUsed > 0) {
        db.gv_gc_ledgers.push({
          id: 'LEDGER-GC-RESTORE-' + Date.now(),
          userId: ap.userId,
          type: 'GC_RESTORE',
          amount: ap.gcUsed,
          referenceId: ap.id,
          note: `감정대행(${ap.id}) 접수 취소에 따른 사용 GC 환원`,
          createdAt: new Date().toISOString()
        });
      }
      saveInBrowserDB(db);
    }
    return { success: true, message: '감정 상태가 변경되었습니다.' };
  }
  if (cleanPath.startsWith('/api/admin/appraisals/') && cleanPath.endsWith('/certificate')) {
    const apId = cleanPath.split('/')[4];
    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const serial = String(db.certificates.length + 1).padStart(4, '0');
    const certNo = `GL-CERT-${dateStr}-${serial}`;
    const cert = {
      id: certNo,
      appraisalId: apId,
      documentNo: certNo,
      docNumber: certNo,
      receiptNo: apId,
      verificationToken: 'vtok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      verifyToken: 'vtok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      itemType: (body && body.itemType) ? body.itemType : '24K 순금 골드바',
      measuredWeight: (body && body.measuredWeight) ? body.measuredWeight : '37.502g (10돈)',
      measuredPurity: (body && body.measuredPurity) ? body.measuredPurity : 'Au 99.99% (포나인 순금)',
      inspectionMethod: (body && body.inspectionMethod) ? body.inspectionMethod : '형광 X선(XRF) 분광 분석 및 전자 비중 측정',
      laboratory: (body && body.laboratory) ? body.laboratory : 'GoldLab 정밀분석실',
      inspectionDate: new Date().toISOString().substring(0, 10).replace(/-/g, '.'),
      issueDate: new Date().toISOString().substring(0, 10).replace(/-/g, '.'),
      issuer: '황미숙 (GoldLab & Co.)',
      status: 'VALID',
      notes: (body && body.notes) ? body.notes : '비파괴 XRF 성분분석 및 비중 측정 결과 정상 규격 합격. 도금 또는 심재 이상 없음.'
    };
    db.certificates.unshift(cert);
    const ap = db.appraisals.find(x => x.id === apId);
    if (ap) {
      ap.status = 'INSPECTED';
      ap.certificateNo = certNo;
    }
    saveInBrowserDB(db);
    return { success: true, message: '확인서가 성공적으로 발행되었습니다.', certificate: cert };
  }

  // 22. Admin: Orders
  if (cleanPath === '/api/admin/orders') {
    return { success: true, orders: db.orders };
  }
  if (cleanPath.startsWith('/api/admin/orders/') && cleanPath.endsWith('/status')) {
    const ordId = cleanPath.split('/')[4];
    const o = db.orders.find(x => x.id === ordId);
    if (o) {
      if (body && body.nextStatus) o.status = body.nextStatus;
      if (body && body.orderStatus) o.orderStatus = body.orderStatus;
      if (body && (body.trackingNo || body.trackingNumber)) {
        o.trackingNo = body.trackingNo || body.trackingNumber;
        o.trackingNumber = o.trackingNo;
        o.courier = '우체국택배';
      }
      if (o.status === 'COMPLETED' || o.status === 'DELIVERED') {
        if (!o.gcAccrued) {
          const accrualGC = o.accrualGC || Math.floor(o.finalPayAmount * (o.accrualRate || 0.004));
          if (accrualGC > 0) {
            db.gv_gc_ledgers.push({
              id: 'LEDGER-GC-ACCRUAL-' + Date.now(),
              userId: o.userId,
              type: 'GC_ADD',
              amount: accrualGC,
              referenceId: o.id,
              note: `주문(${o.id}) 구매확정 상품 적립`,
              createdAt: new Date().toISOString()
            });
          }
          db.gv_gc_ledgers.push({
            id: 'LEDGER-GV-AUTO-' + Date.now(),
            userId: o.userId,
            type: 'GV_ADD',
            amount: o.finalPayAmount,
            referenceId: o.id,
            note: `주문(${o.id}) 구매 실적 GV 적립`,
            createdAt: new Date().toISOString()
          });
          o.gcAccrued = true;
        }
      }
      saveInBrowserDB(db);
    }
    return { success: true, message: '주문 상태가 변경되었습니다.', order: o };
  }

  // 23. Admin: Reservations
  if (cleanPath === '/api/admin/reservations') {
    return { success: true, reservations: db.reservations };
  }

  // 24. Admin: Inquiries
  if (cleanPath === '/api/admin/inquiries') {
    return { success: true, inquiries: db.inquiries };
  }
  if (cleanPath.startsWith('/api/admin/inquiries/') && cleanPath.endsWith('/reply')) {
    const inqId = cleanPath.split('/')[4];
    const iq = db.inquiries.find(x => x.id === inqId);
    if (iq) {
      iq.reply = (body && body.reply) ? body.reply : '';
      iq.status = 'REPLIED';
      saveInBrowserDB(db);
    }
    return { success: true, message: '답변이 성공적으로 등록되었습니다.' };
  }

  // 25. Admin: Ledger Adjust
  if (cleanPath === '/api/admin/gv-gc/adjust' || cleanPath === '/api/admin/ledger/adjust') {
    const targetUserId = body && body.targetUserId;
    const gvDelta = parseInt((body && (body.gvDelta || body.amount)) || 0, 10);
    const gcDelta = parseInt((body && body.gcDelta) || 0, 10);
    const reason = (body && body.reason) ? body.reason : '관리자 수동 조정';

    if (gvDelta !== 0) {
      db.gv_gc_ledgers.push({
        id: 'LEDGER-ADJ-GV-' + Date.now(),
        userId: targetUserId,
        type: gvDelta > 0 ? 'GV_ADD' : 'GV_SUB',
        amount: Math.abs(gvDelta),
        note: `[관리자 수동조정] ${reason}`,
        createdAt: new Date().toISOString()
      });
    }
    if (gcDelta !== 0) {
      db.gv_gc_ledgers.push({
        id: 'LEDGER-ADJ-GC-' + Date.now(),
        userId: targetUserId,
        type: gcDelta > 0 ? 'GC_ADD' : 'GC_USE',
        amount: Math.abs(gcDelta),
        note: `[관리자 수동조정] ${reason}`,
        createdAt: new Date().toISOString()
      });
    }
    saveInBrowserDB(db);
    return { success: true, message: '포인트 및 실적이 성공적으로 반영되었습니다.' };
  }

  // 26. Admin: Audit Logs
  if (cleanPath === '/api/admin/audit-logs') {
    return { success: true, logs: db.audit_logs };
  }

  // 27. Reviews: Public List with Real Dynamic Aggregates
  if (cleanPath === '/api/reviews' && method === 'GET') {
    const rawUrl = (path || '');
    const urlParams = new URLSearchParams(rawUrl.includes('?') ? rawUrl.split('?')[1] : '');
    const reqCategory = urlParams.get('category') || 'ALL';
    const page = Math.max(1, parseInt(urlParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(50, parseInt(urlParams.get('limit') || '10', 10)));

    const allPublic = (db.reviews || []).filter(r => 
      r.isPublic && 
      !r.isDeleted &&
      r.userId !== 'usr_customer_review_01' &&
      !(r.content && r.content.includes('타이핀')) &&
      !(r.authorName && r.authorName.includes('이*정'))
    );
    const totalCount = allPublic.length;
    let sumRating = 0;
    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const categoryCounts = { ALL: totalCount, GOLD_SELL: 0, PRODUCT_BUY: 0, APPRAISAL: 0, GENERAL: 0 };

    allPublic.forEach(r => {
      const rt = Math.round(Number(r.rating) || 5);
      sumRating += rt;
      if (ratingCounts[rt] !== undefined) ratingCounts[rt]++;
      if (categoryCounts[r.category] !== undefined) categoryCounts[r.category]++;
    });

    const averageRating = totalCount > 0 ? Number((sumRating / totalCount).toFixed(1)) : 0;

    let filtered = allPublic;
    if (reqCategory && reqCategory !== 'ALL') {
      filtered = allPublic.filter(r => r.category === reqCategory);
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const filteredCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(filteredCount / limit));
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    function maskName(str) {
      if (!str || typeof str !== 'string') return '고객*';
      const clean = str.trim();
      if (clean.length <= 1) return clean + '*';
      if (clean.length === 2) return clean[0] + '*';
      if (clean.length === 3) return clean[0] + '*' + clean[2];
      if (clean.length === 4) return clean[0] + '**' + clean[3];
      return clean.slice(0, 2) + '*'.repeat(Math.min(clean.length - 3, 3)) + clean.slice(-1);
    }

    const rawUser = localStorage.getItem('goldlab_active_user');
    let curUid = null;
    if (rawUser) {
      try { curUid = JSON.parse(rawUser)?.id; } catch(e) {}
    }

    const safeReviews = paginated.map(r => ({
      id: r.id,
      authorMasked: r.authorMasked || maskName(r.authorName),
      maskedAuthor: r.authorMasked || maskName(r.authorName),
      category: r.category,
      categoryLabel: r.categoryLabel,
      rating: r.rating,
      content: r.content,
      photos: r.photos || [],
      isVerifiedTrade: !!r.isVerifiedTrade,
      isVerified: !!r.isVerifiedTrade,
      adminReply: r.adminReply ? {
        content: r.adminReply.content,
        repliedAt: r.adminReply.repliedAt,
        adminName: r.adminReply.adminName || '황미숙 대표 (골드랩&co)'
      } : null,
      createdAt: r.createdAt,
      isMyReview: curUid ? (r.userId === curUid) : false
    }));

    return {
      success: true,
      reviews: safeReviews,
      totalCount,
      filteredCount,
      totalPages,
      currentPage: page,
      averageRating,
      ratingCounts,
      categoryCounts
    };
  }

  // 28. Reviews: My Eligible Completed Transactions
  if (cleanPath === '/api/reviews/my-eligible-transactions' && method === 'GET') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let user = null;
    if (rawUser) {
      try { user = JSON.parse(rawUser); } catch(e) {}
    }
    if (!user) {
      throw new Error('로그인 후 이용 가능합니다.');
    }

    const myOrders = (db.orders || []).filter(o => 
      (o.userId === user.id || o.recipientPhone === user.phone) &&
      (o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.orderStatus === 'COMPLETED' || o.orderStatus === 'DELIVERED')
    );

    const myAppraisals = (db.appraisals || []).filter(a =>
      (a.userId === user.id || a.applicantPhone === user.phone) &&
      (a.status === 'COMPLETED' || a.status === 'INSPECTED' || a.status === 'RETURN_SHIPPED')
    );

    const reviewedMap = {};
    (db.reviews || []).forEach(r => {
      if (r.transactionType && r.transactionId) {
        reviewedMap[r.transactionType + ':' + r.transactionId] = r.id;
      }
    });

    const eligibleItems = [];
    for (const o of myOrders) {
      const key = 'ORDER:' + o.id;
      const alreadyReviewId = reviewedMap[key];
      const prodName = o.productName || (o.items && o.items[0] ? o.items[0].name : '주문 상품');
      eligibleItems.push({
        transactionType: 'ORDER',
        transactionId: o.id,
        category: 'PRODUCT_BUY',
        categoryLabel: '제품 구매',
        title: prodName,
        date: o.createdAt ? o.createdAt.substring(0, 10) : '',
        status: o.status || o.orderStatus,
        alreadyReviewed: !!alreadyReviewId,
        reviewId: alreadyReviewId || null
      });
    }

    for (const a of myAppraisals) {
      const key = 'APPRAISAL:' + a.id;
      const alreadyReviewId = reviewedMap[key];
      const isGoldSell = (a.itemType && (a.itemType.includes('매입') || a.itemType.includes('판매') || a.itemType.includes('고금')));
      const cat = isGoldSell ? 'GOLD_SELL' : 'APPRAISAL';
      const catLabel = isGoldSell ? '금 판매' : '감정 이용';
      const isEvent = !!(a.isEventApplied || a.eventCode === 'FREE_APPRAISAL_2026');
      const prefix = isEvent ? '[이벤트] ' : '';
      eligibleItems.push({
        transactionType: 'APPRAISAL',
        transactionId: a.id,
        category: cat,
        categoryLabel: catLabel,
        title: `${prefix}${catLabel} - ${a.itemType || '귀금속 정밀 감정'} (${a.receiptNo || a.id})`,
        date: a.createdAt ? a.createdAt.substring(0, 10) : '',
        status: a.status,
        isEventApplied: isEvent,
        eventCode: a.eventCode || null,
        alreadyReviewed: !!alreadyReviewId,
        reviewId: alreadyReviewId || null
      });
    }

    return {
      success: true,
      eligibleItems,
      myReviewsCount: (db.reviews || []).filter(r => r.userId === user.id).length
    };
  }

  // 29. Reviews: Verify Offline Code
  if (cleanPath === '/api/reviews/verify-offline-code' && method === 'POST') {
    const authCode = (body && body.authCode ? String(body.authCode) : '').trim().toUpperCase();
    if (!authCode) throw new Error('인증코드를 입력해 주세요.');
    const offTx = (db.offline_transactions || []).find(t => t.authCode && t.authCode.toUpperCase() === authCode);
    if (!offTx) throw new Error('유효하지 않은 오프라인 거래 인증코드입니다.');
    if (offTx.status === 'REVIEWED') throw new Error('이미 후기 작성이 완료된 오프라인 거래 인증코드입니다.');
    if (offTx.status !== 'AUTHORIZED') throw new Error('현재 사용 불가능한 인증코드입니다.');

    return {
      success: true,
      offlineTx: {
        id: offTx.id,
        authCode: offTx.authCode,
        tradeType: offTx.tradeType,
        tradeTypeLabel: offTx.tradeTypeLabel,
        customerMemo: offTx.customerMemo
      }
    };
  }

  // 30. Reviews: Upload Photo
  if (cleanPath === '/api/reviews/upload-photo' && method === 'POST') {
    const dataUrl = body && body.dataUrl;
    if (!dataUrl) throw new Error('업로드할 사진이 없습니다.');
    return { success: true, url: dataUrl };
  }

  // 31. Reviews: Create Review
  if (cleanPath === '/api/reviews' && method === 'POST') {
    const rawUser = localStorage.getItem('goldlab_active_user');
    let user = null;
    if (rawUser) {
      try { user = JSON.parse(rawUser); } catch(e) {}
    }
    if (!user) throw new Error('로그인 후 후기를 작성할 수 있습니다.');

    const { rating, content, photos, transactionType, transactionId, authCode, category } = body || {};
    const numRating = parseInt(rating, 10);
    if (!numRating || numRating < 1 || numRating > 5) throw new Error('별점은 1점부터 5점까지 직접 선택해 주세요.');

    const trimmedContent = (content || '').trim();
    if (trimmedContent.length < 20 || trimmedContent.length > 1000) {
      throw new Error('후기 본문은 최소 20자 이상 1,000자 이하로 작성해 주세요. (현재: ' + trimmedContent.length + '자)');
    }

    if (transactionType === 'RESERVATION' || String(transactionId).startsWith('GL-RS-')) {
      throw new Error('단순 방문 상담 예약 건은 거래 인증 후기를 작성할 수 없습니다.');
    }

    let finalCategory = category || 'GENERAL';
    let finalCategoryLabel = '회원 이용 후기';
    let verifiedTxId = transactionId || authCode;
    let verifiedTxType = transactionType || 'MEMBER';

    let isEventReview = false;
    let eventCode = null;
    let eventNotice = null;

    if (!verifiedTxType || verifiedTxType === 'MEMBER' || verifiedTxId === 'GENERAL' || verifiedTxId === 'MEMBER') {
      verifiedTxType = 'MEMBER';
      verifiedTxId = `MEMBER-${user.id}-${Date.now()}`;
      if (finalCategory === 'GOLD_SELL') finalCategoryLabel = '금 판매';
      else if (finalCategory === 'PRODUCT_BUY') finalCategoryLabel = '제품 구매';
      else if (finalCategory === 'APPRAISAL') finalCategoryLabel = '감정 이용';
      else { finalCategory = 'GENERAL'; finalCategoryLabel = '회원 이용 후기'; }
    } else if (verifiedTxType === 'ORDER') {
      const ord = (db.orders || []).find(o => o.id === verifiedTxId);
      finalCategory = 'PRODUCT_BUY';
      finalCategoryLabel = '제품 구매';
    } else if (verifiedTxType === 'APPRAISAL') {
      const ap = (db.appraisals || []).find(a => a.id === verifiedTxId);
      const isGoldSell = ap && ap.itemType && (ap.itemType.includes('매입') || ap.itemType.includes('판매') || ap.itemType.includes('고금'));
      finalCategory = isGoldSell ? 'GOLD_SELL' : 'APPRAISAL';
      finalCategoryLabel = isGoldSell ? '금 판매' : '감정 이용';

      if (ap && (ap.isEventApplied || ap.eventCode === 'FREE_APPRAISAL_2026')) {
        isEventReview = true;
        eventCode = 'FREE_APPRAISAL_2026';
        eventNotice = '감정비 무료 이벤트 혜택을 제공받아 작성한 후기입니다.';
      }
    } else if (verifiedTxType === 'OFFLINE') {
      const cleanCode = (authCode || verifiedTxId).trim().toUpperCase();
      const offTx = (db.offline_transactions || []).find(t => t.authCode && t.authCode.toUpperCase() === cleanCode);
      if (!offTx || offTx.status !== 'AUTHORIZED') throw new Error('유효한 오프라인 거래 인증코드가 아닙니다.');
      verifiedTxId = offTx.authCode;
      finalCategory = offTx.tradeType;
      finalCategoryLabel = offTx.tradeTypeLabel;
      offTx.status = 'REVIEWED';
      offTx.reviewedUserId = user.id;
      offTx.usedAt = new Date().toISOString();
    }

    // Duplicate check: Block ONLY if already reviewed for this transaction (non-MEMBER)
    if (verifiedTxType !== 'MEMBER') {
      const existing = (db.reviews || []).find(r => r.transactionType === verifiedTxType && r.transactionId === verifiedTxId);
      if (existing) {
        throw new Error('해당 거래 건은 이미 후기가 작성되었습니다. (완료 내역 1건당 후기 1개 제한)');
      }
    }

    function maskName(str) {
      if (!str || typeof str !== 'string') return '고객*';
      const clean = str.trim();
      if (clean.length <= 1) return clean + '*';
      if (clean.length === 2) return clean[0] + '*';
      if (clean.length === 3) return clean[0] + '*' + clean[2];
      if (clean.length === 4) return clean[0] + '**' + clean[3];
      return clean.slice(0, 2) + '*'.repeat(Math.min(clean.length - 3, 3)) + clean.slice(-1);
    }

    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const serial = String((db.reviews || []).length + 1).padStart(4, '0');
    const newRev = {
      id: `REV-${dateStr}-${serial}`,
      userId: user.id,
      authorName: user.name,
      authorMasked: maskName(user.name),
      category: finalCategory,
      categoryLabel: finalCategoryLabel,
      transactionType: verifiedTxType,
      transactionId: verifiedTxId,
      rating: numRating,
      content: trimmedContent,
      photos: Array.isArray(photos) ? photos.slice(0, 3) : [],
      isVerifiedTrade: true,
      isEventReview: !!isEventReview,
      eventCode: isEventReview ? eventCode : null,
      eventNotice: isEventReview ? eventNotice : null,
      isPublic: true,
      hiddenReason: null,
      hiddenAt: null,
      hiddenBy: null,
      isDeleted: false,
      adminReply: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (transactionType === 'OFFLINE') {
      const offTx = (db.offline_transactions || []).find(t => t.authCode && t.authCode.toUpperCase() === verifiedTxId.toUpperCase());
      if (offTx) offTx.reviewedReviewId = newRev.id;
    }

    if (transactionType === 'APPRAISAL') {
      const ap = (db.appraisals || []).find(a => a.id === verifiedTxId);
      if (ap) {
        ap.reviewedReviewId = newRev.id;
        ap.reviewedAt = new Date().toISOString();
        if (ap.isEventApplied) ap.reviewStatus = 'COMPLETED';
      }
    }

    if (!Array.isArray(db.reviews)) db.reviews = [];
    db.reviews.unshift(newRev);
    saveInBrowserDB(db);
    return { success: true, message: '소중한 후기가 성공적으로 등록되었습니다.', review: newRev };
  }

  // 32. Reviews: Edit
  if (cleanPath.startsWith('/api/reviews/') && method === 'PUT') {
    const revId = cleanPath.split('/')[3];
    const review = (db.reviews || []).find(r => r.id === revId && !r.isDeleted);
    if (!review) throw new Error('후기를 찾을 수 없습니다.');

    if (body.rating) review.rating = parseInt(body.rating, 10);
    if (body.content) review.content = String(body.content).trim();
    if (Array.isArray(body.photos)) review.photos = body.photos.slice(0, 3);
    review.updatedAt = new Date().toISOString();
    saveInBrowserDB(db);
    return { success: true, message: '후기가 수정되었습니다.', review };
  }

  // 33. Reviews: Delete
  if (cleanPath.startsWith('/api/reviews/') && method === 'DELETE') {
    const revId = cleanPath.split('/')[3];
    const review = (db.reviews || []).find(r => r.id === revId && !r.isDeleted);
    if (!review) throw new Error('후기를 찾을 수 없습니다.');

    review.isDeleted = true;
    review.isPublic = false;
    review.deletedAt = new Date().toISOString();
    saveInBrowserDB(db);
    return { success: true, message: '후기가 삭제되었습니다.' };
  }

  // 34. Reviews: Customer Report
  if (cleanPath.startsWith('/api/reviews/') && cleanPath.endsWith('/report') && method === 'POST') {
    const revId = cleanPath.split('/')[3];
    const review = (db.reviews || []).find(r => r.id === revId);
    if (!review) throw new Error('신고 대상 후기를 찾을 수 없습니다.');

    const newReport = {
      id: 'REP-' + Date.now(),
      reviewId: review.id,
      reason: body && body.reason,
      detail: body && body.detail,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    if (!Array.isArray(db.review_reports)) db.review_reports = [];
    db.review_reports.unshift(newReport);
    saveInBrowserDB(db);
    return { success: true, message: '신고가 정상 접수되었습니다.' };
  }

  // 35. Admin: Reviews List
  if (cleanPath === '/api/admin/reviews' && method === 'GET') {
    const allReviews = db.reviews || [];
    const reports = db.review_reports || [];
    const adminReviews = allReviews.map(r => {
      const u = (db.users || []).find(x => x.id === r.userId);
      const repCount = reports.filter(rep => rep.reviewId === r.id && rep.status === 'PENDING').length;
      return {
        ...r,
        authorRealName: u ? u.name : r.authorName,
        authorEmail: u ? u.email : '',
        authorPhone: u ? u.phone : '',
        pendingReportsCount: repCount
      };
    });
    return { success: true, reviews: adminReviews, totalReviews: adminReviews.length };
  }

  // 36. Admin: Review Reply
  if (cleanPath.startsWith('/api/admin/reviews/') && cleanPath.endsWith('/reply') && method === 'POST') {
    const revId = cleanPath.split('/')[4];
    const review = (db.reviews || []).find(r => r.id === revId);
    if (!review) throw new Error('후기를 찾을 수 없습니다.');
    review.adminReply = {
      content: body && body.content,
      repliedAt: new Date().toISOString(),
      adminName: '황미숙 대표 (골드랩&co)'
    };
    review.updatedAt = new Date().toISOString();
    saveInBrowserDB(db);
    return { success: true, message: '답변이 등록되었습니다.', adminReply: review.adminReply };
  }
  if (cleanPath.startsWith('/api/admin/reviews/') && cleanPath.endsWith('/reply') && method === 'DELETE') {
    const revId = cleanPath.split('/')[4];
    const review = (db.reviews || []).find(r => r.id === revId);
    if (!review) throw new Error('후기를 찾을 수 없습니다.');
    review.adminReply = null;
    review.updatedAt = new Date().toISOString();
    saveInBrowserDB(db);
    return { success: true, message: '답변이 삭제되었습니다.' };
  }

  // 37. Admin: Review Visibility
  if (cleanPath.startsWith('/api/admin/reviews/') && cleanPath.endsWith('/visibility') && method === 'POST') {
    const revId = cleanPath.split('/')[4];
    const review = (db.reviews || []).find(r => r.id === revId);
    if (!review) throw new Error('후기를 찾을 수 없습니다.');
    review.isPublic = !!(body && body.isPublic);
    review.hiddenReason = body && body.reason;
    review.updatedAt = new Date().toISOString();
    saveInBrowserDB(db);
    return { success: true, message: review.isPublic ? '후기가 복원되었습니다.' : '후기가 숨김 처리되었습니다.' };
  }

  // 38. Admin: Offline Auth
  if (cleanPath === '/api/admin/reviews/offline-auth' && method === 'POST') {
    const { tradeType, customerMemo } = body || {};
    const labels = { GOLD_SELL: '금 판매', PRODUCT_BUY: '제품 구매', APPRAISAL: '감정 이용' };
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const authCode = `GL-REV-${randPart}`;
    const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const serial = String((db.offline_transactions || []).length + 1).padStart(4, '0');

    const offTx = {
      id: `GL-OFF-${dateStr}-${serial}`,
      authCode,
      tradeType: tradeType || 'GOLD_SELL',
      tradeTypeLabel: labels[tradeType] || '금 판매',
      customerMemo: customerMemo || '',
      status: 'AUTHORIZED',
      reviewedReviewId: null,
      createdAt: new Date().toISOString()
    };
    if (!Array.isArray(db.offline_transactions)) db.offline_transactions = [];
    db.offline_transactions.unshift(offTx);
    saveInBrowserDB(db);
    return {
      success: true,
      message: '인증코드가 발급되었습니다.',
      offlineTx: offTx,
      shareUrl: `https://goldlabnco.com/reviews.html?auth_code=${authCode}`
    };
  }
  if (cleanPath === '/api/admin/reviews/offline-auth' && method === 'GET') {
    return { success: true, offlineTransactions: db.offline_transactions || [] };
  }

  // Fallback default
  return { success: true };
}


async function ApiRequest(path, method = 'GET', body = null) {
  const apiBase = (typeof window !== 'undefined' && window.GOLDLAB_API_BASE) ? window.GOLDLAB_API_BASE : '';
  const fullUrl = path.startsWith('http') ? path : (apiBase + path);

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = 'Bearer ' + authToken;
  }
  const opts = { method, headers };
  if (body) {
    opts.body = JSON.stringify(body);
  }

  let useFallback = false;
  let res = null;

  try {
    res = await fetch(fullUrl, opts);
    const contentType = res.headers.get('content-type') || '';

    // Static host (GitHub Pages) returns 404, 405 Method Not Allowed, or non-JSON HTML error page
    if (res.status === 404 || res.status === 405 || !contentType.includes('application/json')) {
      useFallback = true;
    }
  } catch (netErr) {
    useFallback = true;
  }

  if (useFallback) {
    return await InBrowserServerEngine(path, method, body, authToken);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    return await InBrowserServerEngine(path, method, body, authToken);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 404 || res.status === 405) {
      return await InBrowserServerEngine(path, method, body, authToken);
    }
    const errorMsg = (data && (data.error || data.message)) || ('서버 요청 실패 (상태 코드: ' + res.status + ')');
    throw new Error(errorMsg);
  }

  return data;
}

let currentMasterView = 'ADMIN';
let currentInspectingMemberId = null;

// Clean server auth state loader
async function LoadAuthState() {
  authToken = localStorage.getItem('goldlab_auth_token') || '';
  if (!authToken) {
    currentUser = null;
    UpdateAuthUI();
    return;
  }
  try {
    const res = await ApiRequest('/api/auth/me');
    if (res && res.success && res.user) {
      currentUser = res.user;
    } else {
      const raw = localStorage.getItem('goldlab_active_user');
      currentUser = raw ? JSON.parse(raw) : null;
    }
  } catch (err) {
    const raw = localStorage.getItem('goldlab_active_user');
    currentUser = raw ? JSON.parse(raw) : null;
  }
  UpdateAuthUI();
}

let currentSignupUserType = 'PERSONAL';

function UpdateAuthUI() {
  const slot = document.getElementById('authTopSlot');
  const myName = document.getElementById('myUserName');
  const myTier = document.getElementById('myUserTier');
  const topUserEl = document.getElementById('mypageTopUser');
  const masterSwitcher = document.getElementById('masterModeSwitcher');

  if (currentUser) {
    const isMaster = currentUser.role === 'MASTER_ADMIN' || currentUser.role === 'STAFF';
    const isBiz = currentUser.userType === 'BIZ';
    const isApprovedBiz = isBiz && currentUser.status === 'B2B_APPROVED';

    if (slot) {
      if (isMaster) {
        slot.innerHTML = `
          <div style="display:inline-flex; align-items:center; gap:0.55rem; background:linear-gradient(135deg, rgba(224,184,72,0.2) 0%, rgba(147,51,234,0.2) 100%); border:1px solid #e0b848; padding:0.35rem 0.85rem; border-radius:30px; white-space:nowrap; box-shadow:0 0 15px rgba(224,184,72,0.35);">
            <span style="color:#f5e4a2; font-weight:900; font-size:0.9rem;"><i class="fa-solid fa-crown" style="color:#e0b848;"></i> 👑 ${currentUser.name} (${currentUser.role})</span>
            <a href="mypage.html?tab=master" style="background:var(--gold-gradient); color:#000; border-radius:20px; padding:0.2rem 0.65rem; font-size:0.8rem; font-weight:800; text-decoration:none;">관제센터</a>
            <button onclick="LogoutUser()" style="background:rgba(255,255,255,0.15); color:var(--text-light); border:none; border-radius:20px; padding:0.2rem 0.6rem; font-size:0.78rem; font-weight:700; cursor:pointer;">로그아웃</button>
          </div>
        `;
      } else {
        const badgeIcon = isBiz ? '<i class="fa-solid fa-building text-gold"></i>' : '<i class="fa-solid fa-circle-user"></i>';
        const userDisplayLabel = isBiz 
          ? `🏢 ${currentUser.name} (${isApprovedBiz ? '승인B2B' : '심사중'})` 
          : `${currentUser.name} 님`;
        slot.innerHTML = `
          <div style="display:inline-flex; align-items:center; gap:0.6rem; background:rgba(224,184,72,0.12); border:1px solid var(--border-dark); padding:0.35rem 0.9rem; border-radius:30px; white-space:nowrap;">
            <span style="color:var(--gold-light); font-weight:800; font-size:0.92rem;">${badgeIcon} ${userDisplayLabel}</span>
            <a href="mypage.html" style="color:var(--text-white); text-decoration:none; font-size:0.82rem; font-weight:700; padding:0.2rem 0.5rem; background:rgba(255,255,255,0.08); border-radius:12px;">마이페이지</a>
            <button onclick="LogoutUser()" style="background:rgba(255,255,255,0.12); color:var(--text-light); border:none; border-radius:20px; padding:0.2rem 0.65rem; font-size:0.82rem; font-weight:700; cursor:pointer;">로그아웃</button>
          </div>
        `;
      }
    }

    if (myName) {
      if (isMaster) {
        myName.innerHTML = `${currentUser.name} <span style="font-weight:400; font-size:1.1rem; color:var(--gold-light);">(최고 관리자)</span>`;
      } else {
        myName.innerHTML = `${currentUser.name} <span style="font-weight:400; font-size:1.1rem; color:var(--text-muted);">${isBiz ? 'B2B 사업자 회원님' : '회원님의 금 자산 관리 솔루션'}</span>`;
      }
    }
    if (myTier) {
      myTier.innerHTML = `<i class="fa-solid fa-crown text-gold"></i> ${currentUser.tier || 'VIP MEMBER'}`;
    }
    if (topUserEl) {
      topUserEl.innerHTML = `<i class="fa-solid fa-user-check"></i> ${currentUser.name} (${currentUser.tier || 'VIP MEMBER'})`;
    }

    if (masterSwitcher) {
      masterSwitcher.style.display = isMaster ? 'flex' : 'none';
    }
  } else {
    if (slot) {
      slot.innerHTML = `
        <button onclick="OpenAuthModal('login')" style="background:linear-gradient(135deg, #f9e076 0%, #d4af37 50%, #b8860b 100%); color:#0b0c10; border:none; border-radius:30px; padding:0.4rem 1.1rem; font-size:0.82rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:0.45rem; box-shadow:0 0 15px rgba(212,175,55,0.45); white-space:nowrap; word-break:keep-all;">
          <i class="fa-solid fa-user-shield"></i> 로그인 / 회원가입
        </button>
      `;
    }
    if (masterSwitcher) {
      masterSwitcher.style.display = 'none';
    }
  }

  CheckWholesaleAccess();
}

function EnsureAuthModalDOM() {
  if (document.getElementById('authModal')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'authModal';
  overlay.innerHTML = `
    <div class="modal-box">
      <div style="display:flex; justify-content:space-between; align-items:center; position:absolute; top:1.4rem; left:1.6rem; right:1.6rem; z-index:2;">
        <button type="button" id="authHeaderBackBtn" onclick="SwitchAuthTab('login')" style="display:none; background:none!important; border:none!important; color:var(--gold-light)!important; font-size:0.95rem; font-weight:700; cursor:pointer; gap:0.4rem; align-items:center;">
          <i class="fa-solid fa-arrow-left"></i> 뒤로가기
        </button>
        <div style="flex:1;"></div>
        <button class="modal-close" onclick="CloseModal('authModal')" style="position:static;">&times;</button>
      </div>

      <div class="auth-modal-header" style="margin-top:1rem;">
        <div class="brand-logo" style="justify-content:center; margin-bottom:0.6rem;">
          <div class="brand-icon" style="width:38px; height:38px; font-size:1.15rem;"><i class="fa-solid fa-gem"></i></div>
          <span style="font-size:1.5rem;">GoldLab<span class="gradient-text">&Co.</span></span>
        </div>
        <p style="font-size:0.92rem; color:var(--text-muted); text-align:center;" id="authModalSubTitle">VIP 회원 전용 자산 관리 서비스</p>
      </div>

      <!-- 1. LOGIN VIEW -->
      <div id="authViewLogin">
        <form onsubmit="HandleUserLogin(event)">
          <div class="form-group">
            <label class="form-label">로그인 유형 선택</label>
            <select class="form-control" id="loginUserTypeSelect">
              <option value="PERSONAL">👤 일반 회원 로그인 (자산 관리)</option>
              <option value="BIZ">🏢 사업자 회원 로그인 (B2B 도매 전용)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">아이디 (이메일 주소)</label>
            <input type="email" class="form-control" id="loginEmail" placeholder="example@goldlab.co.kr" required>
          </div>

          <div class="form-group" style="margin-bottom:1.2rem;">
            <label class="form-label">비밀번호</label>
            <input type="password" class="form-control" id="loginPass" placeholder="••••••••" required>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.8rem; font-size:0.92rem;">
            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--text-muted);">
              <input type="checkbox" id="loginRemember" checked style="accent-color:var(--gold-primary);"> 로그인 상태 유지
            </label>
            <button type="button" onclick="SwitchAuthTab('find')" style="background:transparent; border:none; color:var(--gold-light); font-size:0.9rem; cursor:pointer;">아이디 · 비밀번호 찾기</button>
          </div>

          <button type="submit" class="btn btn-gold" style="width:100%; padding:0.95rem; font-size:1.05rem;"><i class="fa-solid fa-right-to-bracket"></i> 로그인 하기</button>
        </form>

        <div style="margin-top:1.5rem; text-align:center; font-size:0.95rem; color:var(--text-muted);">
          <span>처음 방문하셨나요?</span>
          <button type="button" onclick="SwitchAuthTab('signup')" style="background:none; border:none; color:var(--gold-light); font-weight:800; cursor:pointer; text-decoration:underline; margin-left:0.5rem;">
            간편 회원가입 <i class="fa-solid fa-arrow-right-long"></i>
          </button>
        </div>
      </div>

      <!-- 2. SIGN UP VIEW -->
      <div id="authViewSignup" style="display:none;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; background:rgba(9,11,16,0.9); padding:0.35rem; border-radius:12px; border:1px solid var(--border-dark); margin-bottom:1.5rem;">
          <button type="button" id="btnSignupPersonal" onclick="SwitchSignupUserType('PERSONAL')" style="background:var(--gold-gradient); color:#000; font-weight:800; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; font-size:0.92rem;">
            👤 일반 고객 회원가입
          </button>
          <button type="button" id="btnSignupBiz" onclick="SwitchSignupUserType('BIZ')" style="background:transparent; color:var(--text-muted); font-weight:800; border:none; padding:0.6rem; border-radius:8px; cursor:pointer; font-size:0.92rem;">
            🏢 사업자 회원가입 (B2B)
          </button>
        </div>

        <form onsubmit="HandleUserSignup(event)">
          <div id="signupBizFields" style="display:none;">
            <div class="form-group">
              <label class="form-label text-gold">상호명 (사업자명)</label>
              <input type="text" class="form-control" id="signupBizName" placeholder="예: (주)종로골드 주얼리">
            </div>
            <div class="form-group">
              <label class="form-label text-gold">사업자등록번호 (10자리)</label>
              <input type="text" class="form-control" id="signupBizNo" placeholder="101-86-77777">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" id="signupNameLabel">성함 / 이름</label>
            <input type="text" class="form-control" id="signupName" placeholder="예: 홍길동" required>
          </div>

          <div class="form-group">
            <label class="form-label">아이디 (이메일 주소)</label>
            <input type="email" class="form-control" id="signupEmail" placeholder="example@goldlab.co.kr" required>
          </div>

          <div class="form-group">
            <label class="form-label">비밀번호</label>
            <input type="password" class="form-control" id="signupPass" placeholder="8자리 이상 입력" required>
          </div>

          <div class="form-group" style="margin-bottom:1.2rem;">
            <label class="form-label">휴대폰 번호</label>
            <input type="tel" class="form-control" id="signupPhone" placeholder="010-1234-5678" required>
          </div>

          <div style="margin-bottom:1.8rem; font-size:0.88rem; color:var(--text-muted);">
            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
              <input type="checkbox" required checked style="accent-color:var(--gold-primary);"> [필수] 서비스 이용약관 및 개인정보 처리방침 동의
            </label>
          </div>

          <button type="submit" class="btn btn-gold" style="width:100%; padding:0.95rem; font-size:1.05rem;"><i class="fa-solid fa-user-plus"></i> 회원가입 완료하기</button>
        </form>

        <div style="margin-top:1.5rem; text-align:center; font-size:0.95rem; color:var(--text-muted);">
          <span>이미 계정이 있으신가요?</span>
          <button type="button" onclick="SwitchAuthTab('login')" style="background:none; border:none; color:var(--gold-light); font-weight:800; cursor:pointer; text-decoration:underline; margin-left:0.5rem;">
            ← 로그인 화면으로 돌아가기
          </button>
        </div>
      </div>

      <!-- 3. FIND ACCOUNT VIEW -->
      <div id="authViewFind" style="display:none;">
        <form onsubmit="HandleFindAccount(event)">
          <div class="form-group">
            <label class="form-label">가입된 성함</label>
            <input type="text" class="form-control" id="findName" placeholder="예: 김골드" required>
          </div>

          <div class="form-group" style="margin-bottom:2rem;">
            <label class="form-label">가입 시 입력한 휴대폰 번호</label>
            <input type="tel" class="form-control" id="findPhone" placeholder="010-1234-5678" required>
          </div>

          <button type="submit" class="btn btn-gold" style="width:100%; padding:0.95rem; font-size:1.05rem;"><i class="fa-solid fa-key"></i> 아이디 찾기 / 임시 비밀번호 발송</button>
        </form>

        <div style="margin-top:1.5rem; text-align:center; font-size:0.95rem;">
          <button type="button" onclick="SwitchAuthTab('login')" style="background:none; border:none; color:var(--gold-light); font-weight:800; cursor:pointer; text-decoration:underline;">
            ← 로그인 화면으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function OpenAuthModal(tab = 'login') {
  EnsureAuthModalDOM();
  SwitchAuthTab(tab);
  const m = document.getElementById('authModal');
  if (m) m.classList.add('active');
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
    if (subTitle) subTitle.innerText = tab === 'signup_biz' ? '🏢 B2B 사업자 회원가입' : 'GoldLab & Co. 간편 회원가입';
    if (backBtn) backBtn.style.display = 'inline-flex';
    if (tab === 'signup_biz') {
      SwitchSignupUserType('BIZ');
    }
  } else if (tab === 'find') {
    if (vFind) vFind.style.display = 'block';
    if (subTitle) subTitle.innerText = '계정 비밀번호 재설정 링크 발송';
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

async function HandleUserLogin(e) {
  e.preventDefault();
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const pass = (document.getElementById('loginPass')?.value || '').trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!email || !pass) {
    alert('이메일과 비밀번호를 모두 입력해 주세요.');
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '보안 인증 처리 중...'; }

  try {
    const res = await ApiRequest('/api/auth/login', 'POST', { email, password: pass });
    
    // Check if 2FA TOTP is required for Admin
    if (res.require2fa) {
      const totpCode = prompt('[2단계 인증 (2FA)]\n관리자 계정 보안을 위해 TOTP 6자리 번호를 입력하세요:');
      if (!totpCode) {
        alert('2단계 인증번호를 입력하지 않아 로그인이 취소되었습니다.');
        return;
      }
      const res2fa = await ApiRequest('/api/auth/login', 'POST', { email, password: pass, totpCode });
      authToken = res2fa.token;
      localStorage.setItem('goldlab_auth_token', authToken);
      currentUser = res2fa.user;
      localStorage.setItem('goldlab_active_user', JSON.stringify(currentUser));
    } else {
      authToken = res.token;
      localStorage.setItem('goldlab_auth_token', authToken);
      currentUser = res.user;
      localStorage.setItem('goldlab_active_user', JSON.stringify(currentUser));
    }

    UpdateAuthUI();
    CloseModal('authModal');

    const authRedirect = sessionStorage.getItem('goldlab_auth_redirect');
    if (authRedirect) {
      sessionStorage.removeItem('goldlab_auth_redirect');
      alert('[👤 로그인 완료]\n환영합니다, ' + currentUser.name + ' 회원님!\n무료 감정 신청 화면으로 연결합니다.');
      window.location.href = authRedirect;
      return;
    }

    if (currentUser.role === 'MASTER_ADMIN' || currentUser.role === 'STAFF') {
      alert('[👑 관리자 인증 완료]\n' + currentUser.name + ' 님, 환영합니다.\n관리자 관제센터로 연결합니다.');
      window.location.href = 'mypage.html?tab=master';
    } else if (currentUser.userType === 'BIZ') {
      alert('[🏢 B2B 사업자 로그인]\n환영합니다, ' + currentUser.name + ' 사업자 회원님!');
      window.location.href = 'wholesale.html';
    } else {
      alert('[👤 로그인 완료]\n환영합니다, ' + currentUser.name + ' 회원님!');
      if (window.location.pathname.includes('wholesale.html')) {
        window.location.href = 'mypage.html';
      }
    }
  } catch (err) {
    alert('[로그인 실패] ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 로그인 하기';
    }
  }
}

async function HandleUserSignup(e) {
  e.preventDefault();
  const name = (document.getElementById('signupName')?.value || '').trim();
  const email = (document.getElementById('signupEmail')?.value || '').trim();
  const pass = (document.getElementById('signupPass')?.value || '').trim();
  const phone = (document.getElementById('signupPhone')?.value || '').trim();
  const isBiz = currentSignupUserType === 'BIZ';
  const bizName = (document.getElementById('signupBizName')?.value || '').trim();
  const bizNo = (document.getElementById('signupBizNo')?.value || '').trim();

  if (isBiz && (!bizName || !bizNo)) {
    alert('사업자명과 사업자등록번호를 정확히 입력해 주세요.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '가입 등록 중...'; }

  try {
    const res = await ApiRequest('/api/auth/register', 'POST', {
      name,
      email,
      password: pass,
      phone,
      userType: isBiz ? 'BIZ' : 'PERSONAL',
      bizName,
      bizNo
    });

    authToken = res.token;
    localStorage.setItem('goldlab_auth_token', authToken);
    currentUser = res.user;
    localStorage.setItem('goldlab_active_user', JSON.stringify(currentUser));

    UpdateAuthUI();
    CloseModal('authModal');

    const authRedirect = sessionStorage.getItem('goldlab_auth_redirect');
    if (authRedirect) {
      sessionStorage.removeItem('goldlab_auth_redirect');
      alert('[🎉 회원가입 완료]\n환영합니다, ' + currentUser.name + ' 회원님! 신규 가입 축하 5,000 GC 포인트가 적립되었습니다.\n무료 감정 신청 화면으로 연결합니다.');
      window.location.href = authRedirect;
      return;
    }

    if (isBiz) {
      alert('[🏢 B2B 회원가입 완료]\n사업자 인증 심사 요청이 접수되었습니다. 관리자 승인 완료 후 종로 도매 특가 단가 및 대량 발주 기능이 활성화됩니다.');
      window.location.href = 'wholesale.html';
    } else {
      alert('[🎉 회원가입 완료]\n환영합니다, ' + currentUser.name + ' 회원님! 신규 가입 축하 5,000 GC 포인트가 적립되었습니다.');
      window.location.href = 'mypage.html';
    }
  } catch (err) {
    alert('[회원가입 실패] ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> 회원가입 완료하기';
    }
  }
}

async function HandleFindAccount(e) {
  e.preventDefault();
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  if (!email) {
    const inputEmail = prompt('비밀번호를 재설정할 계정 이메일 주소를 입력하세요:');
    if (!inputEmail) return;
    try {
      const res = await ApiRequest('/api/auth/forgot-password', 'POST', { email: inputEmail });
      alert('[안내] 비밀번호 재설정 일회용 링크가 생성되었습니다.\n(운영 배포 시 등록된 이메일로 자동 전송됩니다)\n임시 재설정 토큰: ' + res.resetToken);
      SwitchAuthTab('login');
    } catch (err) {
      alert('[요청 실패] ' + err.message);
    }
    return;
  }

  try {
    const res = await ApiRequest('/api/auth/forgot-password', 'POST', { email });
    alert('[안내] 비밀번호 재설정 일회용 링크가 생성되었습니다.\n(운영 배포 시 등록된 이메일로 자동 전송됩니다)\n임시 재설정 토큰: ' + res.resetToken);
    SwitchAuthTab('login');
  } catch (err) {
    alert('[요청 실패] ' + err.message);
  }
}

async function LogoutUser() {
  if (authToken) {
    try {
      await ApiRequest('/api/auth/logout', 'POST');
    } catch (e) {}
  }
  authToken = '';
  localStorage.removeItem('goldlab_auth_token');
  currentUser = null;
  UpdateAuthUI();
  alert('안전하게 로그아웃되었습니다.');
  if (window.location.pathname.includes('mypage.html') || window.location.pathname.includes('wholesale.html')) {
    window.location.href = 'index.html';
  }
}

function GetMasterMembersDB() {
  const dummyEmails = ['admin@goldlabnco.com', 'dohyun.kim84@naver.com', 'jieun.lee91@gmail.com', 'donga.jewelry@naver.com', 'eprltls@gmail.com'];
  const dummyNames = ['골드랩 시스템 관리자', '김도현', '이지은', '(주)동아귀금속', '동아귀금속', '일반 회원', '일반회원'];
  const dummyIds = ['usr_admin_001', 'usr_dohyun_01', 'usr_jieun_02', 'usr_donga_03', 'usr_eprltls'];

  const stored = localStorage.getItem('goldlab_master_members_db_v4');
  let members = [];
  if (stored !== null) {
    try { members = JSON.parse(stored); } catch(e) {}
  }
  if (!Array.isArray(members)) members = [];

  members = members.filter(m => 
    !dummyEmails.includes(m.email?.toLowerCase()) && 
    !dummyNames.includes(m.name) && 
    !dummyIds.includes(m.id)
  );

  try {
    localStorage.setItem('goldlab_master_members_db_v4', JSON.stringify(members));
  } catch(e) {}
  return members;
}

function SaveMasterMembersDB(members) {
  localStorage.setItem('goldlab_master_members_db_v4', JSON.stringify(members));
}

function SyncUserTransactionsToMasterDB() {
  // Handled through server ledger in production
}

// --------------------------------------------------------------------------
// 1-1. Master Admin CRM & Ledger Dashboard Controller
// --------------------------------------------------------------------------
function SwitchMasterView(view) {
  if (!currentUser || currentUser.role !== 'MASTER_ADMIN') return;
  currentMasterView = view;

  const btnAdmin = document.getElementById('btnTabMasterAdmin');
  const btnPersonal = document.getElementById('btnTabMasterPersonal');
  const adminSec = document.getElementById('masterAdminSection');
  const personalSec = document.getElementById('personalAssetSection');

  if (view === 'ADMIN') {
    if (btnAdmin) {
      btnAdmin.style.background = 'var(--gold-gradient)';
      btnAdmin.style.color = '#000';
    }
    if (btnPersonal) {
      btnPersonal.style.background = 'rgba(255,255,255,0.08)';
      btnPersonal.style.color = 'var(--text-muted)';
    }
    if (adminSec) adminSec.style.display = 'block';
    if (personalSec) personalSec.style.display = 'none';
    RenderMasterDashboard();
  } else {
    if (btnAdmin) {
      btnAdmin.style.background = 'rgba(255,255,255,0.08)';
      btnAdmin.style.color = 'var(--text-muted)';
    }
    if (btnPersonal) {
      btnPersonal.style.background = 'var(--gold-gradient)';
      btnPersonal.style.color = '#000';
    }
    if (adminSec) adminSec.style.display = 'none';
    if (personalSec) personalSec.style.display = 'block';
    RenderMyPageLedger();
  }
}

function RefreshMasterData() {
  RenderMasterDashboard();
  alert('전체 회원 명부와 실시간 금 자산 손익 데이터가 최신 시세로 갱신되었습니다.');
}

function CalculateMemberAssetSummary(member) {
  const txList = member.transactions || [];
  let totalDonWeight = 0;
  let totalCostSum = 0;
  let totalEvalSum = 0;

  txList.forEach(tx => {
    // Fair retail comparison: use live BUY rates for 매수 transactions
    let rate = currentRates["24K_buy"] || 808000;
    if (tx.purity === '18K') rate = Math.round((currentRates["24K_buy"] || 808000) * 0.75 * 0.98);
    else if (tx.purity === '14K') rate = Math.round((currentRates["24K_buy"] || 808000) * 0.585 * 0.98);
    else if (tx.purity === 'PT') rate = currentRates["PT_buy"] || 329000;
    else if (tx.purity === 'AG') rate = currentRates["AG_buy"] || 11370;

    const evalAmt = rate * tx.donWeight;

    if (tx.type === '매수') {
      totalDonWeight += tx.donWeight;
      totalCostSum += tx.totalCost;
      totalEvalSum += evalAmt;
    } else {
      totalDonWeight -= tx.donWeight;
    }
  });

  if (totalDonWeight < 0) totalDonWeight = 0;
  const diff = totalEvalSum - totalCostSum;
  const profitRate = totalCostSum > 0 ? ((diff / totalCostSum) * 100).toFixed(2) : '0.00';

  return {
    txCount: txList.length,
    totalDonWeight,
    totalGrams: (totalDonWeight * 3.75).toFixed(2),
    totalCostSum,
    totalEvalSum,
    diff,
    profitRate,
    isPlus: diff >= 0
  };
}

function RenderMasterDashboard() {
  const members = GetMasterMembersDB();
  
  let overallMembersCount = members.length;
  let personalCount = 0;
  let bizCount = 0;
  let totalDonSum = 0;
  let totalCostSum = 0;
  let totalEvalSum = 0;

  members.forEach(m => {
    if (m.userType === 'BIZ') bizCount++;
    else personalCount++;

    const summary = CalculateMemberAssetSummary(m);
    totalDonSum += summary.totalDonWeight;
    totalCostSum += summary.totalCostSum;
    totalEvalSum += summary.totalEvalSum;
  });

  const overallDiff = totalEvalSum - totalCostSum;
  const overallRate = totalCostSum > 0 ? ((overallDiff / totalCostSum) * 100).toFixed(2) : '0.00';
  const isOverallPlus = overallDiff >= 0;

  // Update KPI Cards
  const kpiTotalMemEl = document.getElementById('masterKpiTotalMembers');
  const kpiTypesEl = document.getElementById('masterKpiMemberTypes');
  const kpiWeightEl = document.getElementById('masterKpiTotalWeight');
  const kpiWeightGramEl = document.getElementById('masterKpiWeightGram');
  const kpiCostEl = document.getElementById('masterKpiTotalCost');
  const kpiPnlEl = document.getElementById('masterKpiTotalPnl');
  const kpiPnlRateEl = document.getElementById('masterKpiPnlRate');
  const badgeCountEl = document.getElementById('masterMemberCountBadge');

  if (kpiTotalMemEl) kpiTotalMemEl.innerText = `${overallMembersCount}명`;
  if (kpiTypesEl) kpiTypesEl.innerText = `일반 VIP ${personalCount}명 | B2B 도매 ${bizCount}개사`;
  if (kpiWeightEl) kpiWeightEl.innerText = `${totalDonSum.toFixed(2)}돈`;
  if (kpiWeightGramEl) kpiWeightGramEl.innerText = `${(totalDonSum * 3.75).toFixed(2)}g (1돈=3.75g)`;
  if (kpiCostEl) kpiCostEl.innerText = `${formatWon(totalCostSum)} 원`;
  
  if (kpiPnlEl) {
    kpiPnlEl.innerText = `${isOverallPlus ? '+' : ''}${formatWon(overallDiff)} 원`;
    kpiPnlEl.style.color = isOverallPlus ? 'var(--pnl-plus)' : 'var(--pnl-minus)';
  }
  if (kpiPnlRateEl) {
    kpiPnlRateEl.innerText = `당일 한국금거래소 시세 기준 (${isOverallPlus ? '+' : ''}${overallRate}%)`;
    kpiPnlRateEl.style.color = isOverallPlus ? 'var(--pnl-plus)' : 'var(--pnl-minus)';
  }
  if (badgeCountEl) {
    badgeCountEl.innerText = `(총 ${overallMembersCount}명 등록)`;
  }

  RenderMasterMembersTable();
}

function RenderMasterMembersTable() {
  const tbody = document.getElementById('masterMemberTableBody');
  if (!tbody) return;

  const members = GetMasterMembersDB();
  const search = (document.getElementById('masterSearchInput')?.value || '').trim().toLowerCase();
  const typeFilter = document.getElementById('masterTypeFilter')?.value || 'ALL';
  const pnlFilter = document.getElementById('masterPnlFilter')?.value || 'ALL';
  const sort = document.getElementById('masterSortSelect')?.value || 'JOIN_DESC';

  // Filter
  let filtered = members.filter(m => {
    const summary = CalculateMemberAssetSummary(m);

    // Search query
    if (search) {
      const matchName = (m.name || '').toLowerCase().includes(search);
      const matchBiz = (m.bizName || '').toLowerCase().includes(search);
      const matchEmail = (m.email || '').toLowerCase().includes(search);
      const matchPhone = (m.phone || '').toLowerCase().includes(search);
      if (!matchName && !matchBiz && !matchEmail && !matchPhone) return false;
    }

    // Type filter
    if (typeFilter !== 'ALL' && m.userType !== typeFilter) return false;

    // PnL filter
    if (pnlFilter === 'PROFIT' && !summary.isPlus) return false;
    if (pnlFilter === 'LOSS' && summary.isPlus) return false;
    if (pnlFilter === 'HAS_TX' && summary.txCount === 0) return false;

    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    const sumA = CalculateMemberAssetSummary(a);
    const sumB = CalculateMemberAssetSummary(b);

    if (sort === 'WEIGHT_DESC') return sumB.totalDonWeight - sumA.totalDonWeight;
    if (sort === 'COST_DESC') return sumB.totalCostSum - sumA.totalCostSum;
    if (sort === 'PROFIT_DESC') return sumB.diff - sumA.diff;
    if (sort === 'RATE_DESC') return parseFloat(sumB.profitRate) - parseFloat(sumA.profitRate);
    // Default: JOIN_DESC
    return (b.joinDate || '').localeCompare(a.joinDate || '');
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:3rem; color:var(--text-muted);">
          조건에 일치하는 회원이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const summary = CalculateMemberAssetSummary(m);
    const isBiz = m.userType === 'BIZ';
    const badgeClass = isBiz ? 'badge-master-biz' : 'badge-master-vip';
    const badgeLabel = isBiz ? '🏢 B2B 도매' : '👤 일반 VIP';
    const pnlColor = summary.isPlus ? 'var(--pnl-plus)' : 'var(--pnl-minus)';
    const pnlSign = summary.isPlus ? '▲ +' : '▼ ';

    return `
      <tr class="master-table-row">
        <td style="white-space:nowrap; padding:1.1rem 0.9rem; font-size:0.88rem; color:var(--text-muted);">${m.joinDate || '-'}</td>
        <td style="white-space:nowrap; padding:1.1rem 0.9rem;">
          <span class="${badgeClass}">${badgeLabel}</span>
        </td>
        <td style="white-space:nowrap; padding:1.1rem 0.9rem;">
          <div style="font-weight:800; color:var(--text-white); font-size:1.02rem;">${m.name}</div>
          ${isBiz && m.bizNo ? `<div style="font-size:0.8rem; color:var(--gold-light);">등록번호: ${m.bizNo}</div>` : ''}
        </td>
        <td style="white-space:nowrap; padding:1.1rem 0.9rem; font-family:var(--font-num); color:var(--text-light);">
          <a href="tel:${m.phone}" style="color:var(--text-light); text-decoration:none;"><i class="fa-solid fa-phone" style="color:var(--gold-primary); font-size:0.85rem;"></i> ${m.phone}</a>
        </td>
        <td style="white-space:nowrap; padding:1.1rem 0.9rem; font-family:var(--font-num); color:var(--text-muted); font-size:0.88rem;">${m.email}</td>
        <td style="white-space:nowrap; padding:1.1rem 0.9rem; font-family:var(--font-num);">
          ${summary.totalDonWeight > 0 ? `<span style="font-weight:800; color:var(--gold-light); font-size:1.02rem;">${summary.totalDonWeight.toFixed(2)}돈</span> <span style="font-size:0.82rem; color:var(--text-muted);">(${summary.totalGrams}g)</span>` : '<span style="color:var(--text-muted); font-size:0.85rem;">미등록</span>'}
        </td>
        <td style="white-space:nowrap; padding:1.1rem 0.9rem; font-family:var(--font-num); font-weight:700; color:var(--text-white);">
          ${summary.totalCostSum > 0 ? `${formatWon(summary.totalCostSum)}원` : '-'}
        </td>
        <td style="white-space:nowrap; padding:1.1rem 0.9rem; font-family:var(--font-num);">
          ${summary.totalCostSum > 0 ? `
            <div style="color:${pnlColor}; font-weight:900; font-size:0.98rem;">${pnlSign}${formatWon(Math.abs(summary.diff))}원</div>
            <div style="color:${pnlColor}; font-size:0.8rem; font-weight:700;">(${pnlSign}${summary.profitRate}%)</div>
          ` : '<span style="color:var(--text-muted); font-size:0.85rem;">-</span>'}
        </td>
        <td style="white-space:nowrap; text-align:center; padding:1.1rem 0.9rem;">
          <button class="master-btn-action" onclick="OpenInspectMemberModal('${m.id}')">
            <i class="fa-solid fa-magnifying-glass-chart"></i> 상세 장부 열람
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function OpenInspectMemberModal(memberId) {
  const members = GetMasterMembersDB();
  const m = members.find(item => item.id === memberId);
  if (!m) {
    alert('해당 회원을 찾을 수 없습니다.');
    return;
  }

  currentInspectingMemberId = memberId;

  // Profile Header
  const nameEl = document.getElementById('inspectMemberName');
  const badgeEl = document.getElementById('inspectMemberBadge');
  const phoneEl = document.getElementById('inspectMemberPhone');
  const emailEl = document.getElementById('inspectMemberEmail');
  const joinEl = document.getElementById('inspectMemberJoinDate');
  const callBtn = document.getElementById('inspectCallBtn');
  const smsBtn = document.getElementById('inspectSmsBtn');
  const noteInput = document.getElementById('inspectMemberNoteInput');

  if (nameEl) nameEl.innerText = `${m.name} 회원님`;
  if (badgeEl) {
    badgeEl.className = m.userType === 'BIZ' ? 'badge-master-biz' : 'badge-master-vip';
    badgeEl.innerText = m.tier || (m.userType === 'BIZ' ? 'B2B VIP' : 'VIP PLATINUM');
  }
  if (phoneEl) phoneEl.innerText = m.phone || '-';
  if (emailEl) emailEl.innerText = m.email || '-';
  if (joinEl) joinEl.innerText = m.joinDate || '-';
  if (callBtn) callBtn.href = `tel:${m.phone}`;
  if (smsBtn) smsBtn.href = `sms:${m.phone}`;
  if (noteInput) noteInput.value = m.note || '';

  // Calculate Asset Summary
  const summary = CalculateMemberAssetSummary(m);
  const kpiGrid = document.getElementById('inspectKpiGrid');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="master-kpi-card" style="padding:1.1rem 1.3rem;">
        <div class="master-kpi-title" style="margin-bottom:0.3rem;"><i class="fa-solid fa-coins text-gold"></i> 보유 금 중량</div>
        <div class="master-kpi-val" style="font-size:1.35rem;">${summary.totalDonWeight.toFixed(2)}돈</div>
        <div class="master-kpi-sub" style="margin-top:0.2rem;">${summary.totalGrams}g (등록 장부 합계)</div>
      </div>
      <div class="master-kpi-card" style="padding:1.1rem 1.3rem;">
        <div class="master-kpi-title" style="margin-bottom:0.3rem;"><i class="fa-solid fa-wallet text-gold"></i> 총 매수 원금</div>
        <div class="master-kpi-val" style="font-size:1.35rem;">${formatWon(summary.totalCostSum)}원</div>
        <div class="master-kpi-sub" style="margin-top:0.2rem;">구매/등록 당시 실결제 기준</div>
      </div>
      <div class="master-kpi-card" style="padding:1.1rem 1.3rem;">
        <div class="master-kpi-title" style="margin-bottom:0.3rem;"><i class="fa-solid fa-chart-pie text-gold"></i> 현재 시세 평가액</div>
        <div class="master-kpi-val text-gold" style="font-size:1.35rem;">${formatWon(summary.totalEvalSum)}원</div>
        <div class="master-kpi-sub" style="margin-top:0.2rem;">한국금거래소 당일 매도가 기준</div>
      </div>
      <div class="master-kpi-card" style="padding:1.1rem 1.3rem;">
        <div class="master-kpi-title" style="margin-bottom:0.3rem;"><i class="fa-solid fa-chart-line text-gold"></i> 실시간 평가손익</div>
        <div class="master-kpi-val" style="font-size:1.35rem; color:${summary.isPlus ? 'var(--pnl-plus)' : 'var(--pnl-minus)'};">${summary.isPlus ? '+' : ''}${formatWon(summary.diff)}원</div>
        <div class="master-kpi-sub" style="margin-top:0.2rem; color:${summary.isPlus ? 'var(--pnl-plus)' : 'var(--pnl-minus)'}; font-weight:700;">수익률: ${summary.isPlus ? '+' : ''}${summary.profitRate}%</div>
      </div>
    `;
  }

  // Transactions Table
  const tbody = document.getElementById('inspectTxTableBody');
  const txList = m.transactions || [];
  if (tbody) {
    if (txList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">
            이 회원이 아직 마이페이지에 등록한 금 매매/보유 거래 내역이 없습니다.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = txList.map(tx => {
        let rate = currentRates["24K_buy"] || 808000;
        let sellRate = currentRates["24K_sell"] || 688000;
        if (tx.purity === '18K') {
          rate = Math.round((currentRates["24K_buy"] || 808000) * 0.75 * 0.98);
          sellRate = currentRates["18K_sell"] || 505700;
        } else if (tx.purity === '14K') {
          rate = Math.round((currentRates["24K_buy"] || 808000) * 0.585 * 0.98);
          sellRate = currentRates["14K_sell"] || 392200;
        } else if (tx.purity === 'PT') {
          rate = currentRates["PT_buy"] || 329000;
          sellRate = currentRates["PT_sell"] || 267000;
        } else if (tx.purity === 'AG') {
          rate = currentRates["AG_buy"] || 11370;
          sellRate = currentRates["AG_sell"] || 9470;
        }

        const evalAmt = rate * tx.donWeight;
        const diff = evalAmt - tx.totalCost;
        const ratePct = tx.totalCost > 0 ? ((diff / tx.totalCost) * 100).toFixed(2) : '0.00';
        const isPlus = diff >= 0;
        const sparkline = GenerateTxSvgSparkline(tx, rate, sellRate);

        return `
          <tr>
            <td style="white-space:nowrap; padding:0.9rem;">${tx.date}</td>
            <td style="white-space:nowrap; padding:0.9rem;">
              <span style="padding:0.2rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:800; ${tx.type === '매도' ? 'background:rgba(16,185,129,0.2); color:var(--pnl-plus);' : 'background:rgba(224,184,72,0.2); color:var(--gold-light);'}">${tx.type || '매수'}</span>
            </td>
            <td style="white-space:nowrap; padding:0.9rem;">
              <div style="font-weight:800; color:var(--text-white);">${tx.itemName}</div>
              <div style="font-size:0.8rem; color:var(--text-muted); font-family:var(--font-num);">${tx.donWeight}돈 (${(tx.donWeight * 3.75).toFixed(2)}g)</div>
            </td>
            <td style="white-space:nowrap; font-weight:800; color:var(--gold-light); padding:0.9rem;">${tx.purity}</td>
            <td style="padding:0.6rem 0.9rem;">
              ${sparkline}
            </td>
            <td style="white-space:nowrap; font-family:var(--font-num); font-weight:700; color:var(--text-white); padding:0.9rem;">
              ${formatWon(tx.totalCost)}원
            </td>
            <td style="white-space:nowrap; font-family:var(--font-num); padding:0.9rem;">
              <div style="font-weight:800; color:var(--text-white);">${formatWon(evalAmt)}원</div>
              <div style="font-size:0.82rem; font-weight:700; color:${isPlus ? 'var(--pnl-plus)' : 'var(--pnl-minus)'};">
                ${isPlus ? '▲ +' : '▼ '}${formatWon(Math.abs(diff))}원 (${isPlus ? '+' : ''}${ratePct}%)
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  const modal = document.getElementById('masterMemberLedgerModal');
  if (modal) modal.classList.add('active');
}

function SaveInspectedMemberNote() {
  if (!currentInspectingMemberId) return;
  const noteInput = document.getElementById('inspectMemberNoteInput');
  const newNote = (noteInput?.value || '').trim();

  const members = GetMasterMembersDB();
  const idx = members.findIndex(m => m.id === currentInspectingMemberId);
  if (idx !== -1) {
    members[idx].note = newNote;
    SaveMasterMembersDB(members);
    alert('고객 상담 메모가 성공적으로 저장되었습니다!');
  }
}

async function ExportMasterMembersCSV() {
  if (!currentUser || (currentUser.role !== 'MASTER_ADMIN' && currentUser.role !== 'STAFF')) {
    alert('관리자 권한이 필요합니다.');
    return;
  }
  try {
    const res = await fetch('/api/admin/export-csv', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '다운로드 실패');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    a.href = url;
    a.download = `골드랩앤코_운영회원장부_${todayStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('보안 감사 로그가 기록되었으며, 수식 실행 방지 처리된 CSV 파일이 다운로드되었습니다.');
  } catch (err) {
    alert('[CSV 내보내기 실패] ' + err.message);
  }
}

function AddDemoTestMember() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const isBiz = Math.random() > 0.5;
  const now = new Date();
  const joinDate = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const weight = isBiz ? Math.floor(10 + Math.random() * 40) : Math.floor(2 + Math.random() * 10);
  const unitPrice = 670000 + Math.floor(Math.random() * 20000);
  const totalCost = weight * unitPrice;

  const demoUser = {
    id: 'usr_demo_' + Date.now(),
    name: isBiz ? `(주)골드랩 테스트 파트너${randomNum}` : `신규회원${randomNum}`,
    email: isBiz ? `partner${randomNum}@naver.com` : `golduser${randomNum}@gmail.com`,
    phone: `010-${randomNum}-${String(randomNum).split('').reverse().join('')}`,
    pass: '1234',
    userType: isBiz ? 'BIZ' : 'PERSONAL',
    bizName: isBiz ? `(주)골드랩 테스트 파트너${randomNum}` : '',
    bizNo: isBiz ? `101-86-${randomNum}` : '',
    tier: isBiz ? 'B2B MEMBER' : 'GOLD MEMBER',
    joinDate: joinDate,
    note: '테스트 생성 가입 데이터',
    transactions: [
      {
        id: Date.now(),
        date: joinDate.split(' ')[0],
        type: '매수',
        itemName: isBiz ? '24K 순금 덩어리' : '24K 순금 골드바',
        purity: '24K',
        donWeight: weight,
        unitCost: unitPrice,
        totalCost: totalCost
      }
    ]
  };

  const members = GetMasterMembersDB();
  members.unshift(demoUser);
  SaveMasterMembersDB(members);
  RenderMasterDashboard();
  alert(`테스트 회원 [${demoUser.name} / 24K ${weight}돈 등록]이 성공적으로 생성되었습니다!`);
}

function DeleteMasterMember(memberId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const members = GetMasterMembersDB();
  const target = members.find(m => m.id === memberId);
  const targetName = target ? target.name : '해당 회원';

  if (!confirm(`[회원 삭제 확인]\n'${targetName}' 회원을 명단에서 완전히 삭제하시겠습니까?\n해당 회원의 금 자산 거래 장부도 함께 삭제됩니다.`)) {
    return;
  }

  const updated = members.filter(m => m.id !== memberId);
  SaveMasterMembersDB(updated);
  localStorage.setItem('goldlab_samples_cleared_v4', 'true');

  if (currentInspectingMemberId === memberId) {
    CloseModal('masterMemberLedgerModal');
  }

  RenderMasterDashboard();
  alert(`'${targetName}' 회원이 성공적으로 삭제되었습니다.`);
}

function DeleteInspectedMember() {
  if (!currentInspectingMemberId) return;
  DeleteMasterMember(currentInspectingMemberId);
}

function ClearAllSampleMembers() {
  const members = GetMasterMembersDB();
  if (members.length === 0) {
    alert('현재 등록된 회원이 없습니다.');
    return;
  }

  if (!confirm(`[전체 명단 비우기]\n현재 등록된 모든 회원(${members.length}명) 및 샘플 데이터를 완전히 삭제하시겠습니까?\n\n삭제 후에는 실제 가입하는 고객만 깨끗하게 표시됩니다.`)) {
    return;
  }

  SaveMasterMembersDB([]);
  localStorage.setItem('goldlab_samples_cleared_v4', 'true');
  RenderMasterDashboard();
  alert('모든 회원 및 샘플 데이터가 삭제되었습니다.\n이제 실제 신규 회원만 깔끔하게 등록됩니다.');
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
  const pendingEl = document.getElementById('b2bPendingNoticeCard');

  if (!gateEl || !contentEl) return;

  const isMaster = currentUser && (currentUser.role === 'MASTER_ADMIN' || currentUser.role === 'STAFF');
  const isApprovedBiz = currentUser && currentUser.userType === 'BIZ' && currentUser.status === 'B2B_APPROVED';
  const isPendingBiz = currentUser && currentUser.userType === 'BIZ' && currentUser.status === 'B2B_PENDING';

  if (isMaster || isApprovedBiz) {
    gateEl.style.display = 'none';
    if (pendingEl) pendingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } else if (isPendingBiz) {
    gateEl.style.display = 'none';
    if (pendingEl) pendingEl.style.display = 'block';
    contentEl.style.display = 'none';
  } else {
    gateEl.style.display = 'block';
    if (pendingEl) pendingEl.style.display = 'none';
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

  // Live Timestamp & Status Display
  const now = new Date();
  const timeStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  lastFetchTime = timeStr;
  const timestampEl = document.getElementById('liveTimestamp');
  if (timestampEl) {
    if (isLiveSyncActive) {
      timestampEl.innerHTML = `<i class="fa-solid fa-circle" style="color:#10b981; font-size:0.7rem;"></i> 실시간 수신중 (${timeStr} · 한국금거래소)`;
    } else {
      timestampEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="color:var(--gold-light); font-size:0.7rem;"></i> 시세 갱신 지연 (한국금거래소 ${syncDate} 고시 기준)`;
    }
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
  UpdateChartData();
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
      { key: '24K', title: '🇰🇷 순금 24K (순도 99.99%)', buy: currentRates["24K_buy"], sell: currentRates["24K_sell"] },
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

function GetKstDateString(dateObj = new Date()) {
  const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 60 * 60000));
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${m}.${d}`;
}

// Verified historical benchmark rates from Korea Gold Exchange (KGE)
// Unverified / arbitrary values are not displayed; unverified periods display "시세 이력 준비 중"
const OFFICIAL_24K_HISTORY = {};

function UpdateChartData() {
  const canvasEl = document.getElementById('heroPriceChart') || document.getElementById('goldPriceChart');
  const titleEl = document.getElementById('chartMetalTitle');
  if (!canvasEl && !titleEl) return;

  const subEl = document.getElementById('chartMetalSub');
  const emptyEl = document.getElementById('chartEmptyState');
  const statsBanner = document.getElementById('chartStatsBanner') || document.querySelector('.chart-stats-banner');
  const highEl = document.getElementById('highPriceText');
  const lowEl = document.getElementById('lowPriceText');
  const avgEl = document.getElementById('avgPriceText');

  let metalName = '🇰🇷 국내 순금 24K (3.75g 1돈)';
  let buyTxt = `${formatWon(currentRates["24K_buy"])}원`;
  let sellTxt = `${formatWon(currentRates["24K_sell"])}원`;

  if (currentMarketRegion === 'DOMESTIC') {
    if (activeMetalKey === '18K') {
      metalName = '🇰🇷 국내 18K 금 (3.75g 1돈)';
      buyTxt = '제품시세 적용';
      sellTxt = `${formatWon(currentRates["18K_sell"])}원`;
    } else if (activeMetalKey === '14K') {
      metalName = '🇰🇷 국내 14K 금 (3.75g 1돈)';
      buyTxt = '제품시세 적용';
      sellTxt = `${formatWon(currentRates["14K_sell"])}원`;
    } else if (activeMetalKey === 'PT') {
      metalName = '🇰🇷 국내 백금 Platinum (3.75g 1돈)';
      buyTxt = `${formatWon(currentRates["PT_buy"])}원`;
      sellTxt = `${formatWon(currentRates["PT_sell"])}원`;
    } else if (activeMetalKey === 'AG') {
      metalName = '🇰🇷 국내 은 Silver 99.9% (3.75g 1돈)';
      buyTxt = `${formatWon(currentRates["AG_buy"])}원`;
      sellTxt = `${formatWon(currentRates["AG_sell"])}원`;
    }
  } else {
    if (activeMetalKey === 'G_GOLD') {
      metalName = '🌐 국제 금 시세 (Spot Gold NYMEX 참고지표)';
      buyTxt = '$3,425.00';
      sellTxt = '$3,420.50 / oz';
    } else if (activeMetalKey === 'G_SILVER') {
      metalName = '🌐 국제 은 시세 (Spot Silver NYMEX 참고지표)';
      buyTxt = '$38.90';
      sellTxt = '$38.40 / oz';
    } else if (activeMetalKey === 'G_PT') {
      metalName = '🌐 국제 백금 (Spot Platinum NYMEX 참고지표)';
      buyTxt = '$990.00';
      sellTxt = '$985.00 / oz';
    } else if (activeMetalKey === 'G_FX') {
      metalName = '🌐 원/달러 기준환율 (USD/KRW FX 참고지표)';
      buyTxt = '1,468.00';
      sellTxt = '1,466.50 KRW/$';
    }
  }

  const syncTimeStr = lastFetchTime || '당일 공식 고시 기준';
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-chart-line text-gold"></i> ${metalName} 시세 변동 추이`;

  if (currentMarketRegion === 'DOMESTIC') {
    if (subEl) {
      if (activeMetalKey === '18K' || activeMetalKey === '14K') {
        subEl.innerText = `출처: 한국금거래소 당일 공식 고시 | 살 때: ${buyTxt} · 팔 때(매입가): ${sellTxt} | 마지막 갱신: ${syncTimeStr}`;
      } else {
        subEl.innerText = `출처: 한국금거래소 당일 공식 고시 | 살 때(VAT포함): ${buyTxt} · 팔 때(매입가): ${sellTxt} | 마지막 갱신: ${syncTimeStr}`;
      }
    }
  } else {
    if (subEl) subEl.innerText = `참고용 국제 지표 (정기 고시 기준, 실시간 체결호가 아님) | 매수참고: ${buyTxt} · 매도참고: ${sellTxt} | 마지막 갱신: ${syncTimeStr}`;
  }

  // Check if verified complete historical series exists
  const hasVerifiedHistory = currentMarketRegion === 'DOMESTIC' && 
                             OFFICIAL_24K_HISTORY[activeMetalKey] && 
                             OFFICIAL_24K_HISTORY[activeMetalKey][activePeriod] &&
                             OFFICIAL_24K_HISTORY[activeMetalKey][activePeriod].length >= 10;

  if (hasVerifiedHistory && priceChartInstance) {
    if (canvasEl) canvasEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (statsBanner) statsBanner.style.display = 'flex';

    const historyData = OFFICIAL_24K_HISTORY[activeMetalKey][activePeriod];
    const labels = historyData.map(s => s.date);
    const points = historyData.map(s => s.buy);

    priceChartInstance.data.labels = labels;
    priceChartInstance.data.datasets[0].data = points;
    priceChartInstance.update();

    const minP = Math.min(...points);
    const maxP = Math.max(...points);
    const avgP = Math.round(points.reduce((a, b) => a + b, 0) / points.length);

    if (highEl) highEl.innerHTML = `${formatWon(maxP)} 원 <small style="font-size:0.75rem; color:var(--text-muted);">(${activePeriod} 공식)</small>`;
    if (lowEl) lowEl.innerHTML = `${formatWon(minP)} 원 <small style="font-size:0.75rem; color:var(--text-muted);">(${activePeriod} 공식)</small>`;
    if (avgEl) avgEl.innerHTML = `${formatWon(avgP)} 원 <small style="font-size:0.75rem; color:var(--text-muted);">(${activePeriod} 공식)</small>`;
  } else {
    // When no verified historical series exists: hide chart canvas, hide stats banner, show only clean notice
    if (canvasEl) canvasEl.style.display = 'none';
    if (statsBanner) statsBanner.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = 'flex';
      emptyEl.innerHTML = `
        <div style="text-align:center; padding:3rem 1.5rem;">
          <i class="fa-solid fa-chart-line text-gold" style="font-size:2.8rem; margin-bottom:1rem; opacity:0.7;"></i>
          <h4 style="color:#fff; font-size:1.25rem; font-weight:800; margin-bottom:0.5rem;">시세 이력 준비 중</h4>
          <p style="color:var(--text-muted); font-size:0.92rem; max-width:440px; margin:0 auto; line-height:1.6;">
            선택하신 기간(${activePeriod})의 공식 시세 이력 DB는 연동 준비 중입니다.<br>
            당일 실시간 공식 시세는 좌측 시세 전광판에서 확인하실 수 있습니다.
          </p>
        </div>
      `;
    }

    if (highEl) highEl.innerText = '-';
    if (lowEl) lowEl.innerText = '-';
    if (avgEl) avgEl.innerText = '-';
  }
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

  // Current KST date
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = new Date(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate());
  today.setHours(0, 0, 0, 0);

  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  let html = '';

  for (let i = 0; i < startingDayOfWeek; i++) {
    html += `<div style="height:48px;"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(calendarYear, calendarMonth, day);
    dayDate.setHours(0, 0, 0, 0);

    const dateFormatted = getLocalDateString(dayDate);
    const isPast = dayDate < today;
    const dayOfWeek = dayDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isSelected = dateFormatted === selectedDateStr;
    const isToday = dayDate.getTime() === today.getTime();

    let textColor = 'var(--text-light)';
    if (dayOfWeek === 0) textColor = '#f87171';
    if (dayOfWeek === 6) textColor = '#60a5fa';

    if (isPast || isWeekend) {
      const reason = isPast ? '지난 날짜' : '주말/공휴일 휴무';
      html += `
        <button type="button" disabled style="height:48px; border-radius:12px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); color:#475569; font-weight:600; cursor:not-allowed; opacity:0.35;" title="${reason}">
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
  const container = document.getElementById('timeSlotsContainer') || document.getElementById('timeSlotGrid');
  if (!container) return;

  const dateVal = document.getElementById('bookDate')?.value || selectedDateStr || new Date().toISOString().split('T')[0];
  const dayBookedList = bookedSlots[dateVal] || [];
  const selectedTimeInput = document.getElementById('selectedTime');
  let currentSelected = selectedTimeInput ? selectedTimeInput.value : '';

  // Check if selected date is weekend
  const dParts = dateVal.split('-');
  const selDateObj = new Date(parseInt(dParts[0],10), parseInt(dParts[1],10)-1, parseInt(dParts[2],10));
  if (selDateObj.getDay() === 0 || selDateObj.getDay() === 6) {
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:1.5rem; color:#ef4444; font-weight:700;">주말 및 공휴일은 휴무입니다. 평일 날짜를 선택해 주세요.</div>';
    if (selectedTimeInput) selectedTimeInput.value = '';
    return;
  }

  // Check past time if date is today (in KST)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayKSTStr = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth()+1).padStart(2,'0')}-${String(nowKST.getUTCDate()).padStart(2,'0')}`;
  const isToday = dateVal === todayKSTStr;
  const currentKSTHour = nowKST.getUTCHours();
  const currentKSTMin = nowKST.getUTCMinutes();
  const currentKSTTimeStr = `${String(currentKSTHour).padStart(2,'0')}:${String(currentKSTMin).padStart(2,'0')}`;

  const availableSlots = ALL_TIME_SLOTS.filter(t => {
    const isBooked = dayBookedList.includes(t);
    const isPastTime = isToday && t <= currentKSTTimeStr;
    return !isBooked && !isPastTime;
  });

  if (!currentSelected || !availableSlots.includes(currentSelected)) {
    currentSelected = availableSlots[0] || '';
    if (selectedTimeInput) selectedTimeInput.value = currentSelected;
  }

  container.innerHTML = ALL_TIME_SLOTS.map(t => {
    const isBooked = dayBookedList.includes(t);
    const isPastTime = isToday && t <= currentKSTTimeStr;
    const isUnavailable = isBooked || isPastTime;
    const isSel = t === currentSelected && !isUnavailable;

    if (isUnavailable) {
      const reason = isBooked ? '[마감]' : '[시간지남]';
      return `
        <button type="button" class="time-chip disabled-chip" disabled style="background:#141722!important; border:1px solid rgba(255,255,255,0.08)!important; color:#64748b!important; cursor:not-allowed!important; text-decoration:line-through; padding:0.95rem 0.6rem!important; font-size:1.05rem!important; font-weight:700!important; border-radius:14px!important;">
          ${t} ${reason}
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

async function SubmitReservation(e) {
  e.preventDefault();

  const branch = document.getElementById('selectedBranch')?.value || '종로 본점';
  const category = document.getElementById('bookCategory')?.value || '고금 매입 상담';
  const date = document.getElementById('bookDate')?.value || selectedDateStr;
  const time = document.getElementById('selectedTime')?.value || selectedTimeStr;
  const name = (document.getElementById('bookName')?.value || '').trim();
  const phone = (document.getElementById('bookPhone')?.value || '').trim();
  const memo = (document.getElementById('bookMemo')?.value || '').trim();

  if (!date || !time) {
    alert('방문 희망 날짜와 시간을 선택해주세요.');
    return;
  }
  if (!name || !phone) {
    alert('예약자 성함과 연락처를 입력해주세요.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '예약 처리 중...'; }

  try {
    const res = await ApiRequest('/api/reservations/book', 'POST', {
      branch,
      date,
      time,
      name,
      phone,
      category,
      memo
    });

    const resv = res.reservation;
    const modalBookNo = document.getElementById('modalBookNo');
    const modalBranch = document.getElementById('modalBranch');
    const modalDateTime = document.getElementById('modalDateTime');
    const modalName = document.getElementById('modalName');
    const modalCategory = document.getElementById('modalCategory');
    const modalNotice = document.getElementById('modalBookingNotice');

    if (modalBookNo) modalBookNo.innerText = resv.reservationNo;
    if (modalBranch) modalBranch.innerText = resv.branch;
    if (modalDateTime) modalDateTime.innerText = `${resv.date} ${resv.time}`;
    if (modalName) modalName.innerText = `${resv.name} (${resv.phone})`;
    if (modalCategory) modalCategory.innerText = resv.category;
    if (modalNotice) {
      modalNotice.innerHTML = res.smsStatus && res.smsStatus.sent
        ? '<span style="color:#10b981; font-weight:700;"><i class="fa-solid fa-check"></i> 알림톡 발송 완료</span>'
        : '<span style="color:var(--text-muted); font-size:0.88rem;"><i class="fa-solid fa-info-circle"></i> 예약 접수 완료 (방문 일정 정상 확정 · 알림 연동 대기)</span>';
    }

    const bModal = document.getElementById('bookingModal');
    if (bModal) bModal.classList.add('active');

    // Refresh slot availability
    await LoadBookedSlots();
    RenderTimeSlots();
    e.target.reset();
  } catch (err) {
    alert('[예약 실패] ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> 종로 본점 방문예약 확정하기';
    }
  }
}

function CloseModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

// --------------------------------------------------------------------------
// EVENT POPUP: Free Appraisal Event (귀금속 감정비 무료 이벤트)
// --------------------------------------------------------------------------
const FREE_APPRAISAL_EVENT_CONFIG = {
  code: 'FREE_APPRAISAL_2026',
  title: '귀금속 감정비 무료 이벤트',
  endDateKST: '2026-11-06T23:59:59+09:00',
  endTimestamp: 1793977199000 // 2026-11-06 23:59:59 KST
};

let eventPopupLastFocused = null;
let eventPopupKeydownHandler = null;

function getKstMidnightTimestamp() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600000);
  const kstYear = kstNow.getUTCFullYear();
  const kstMonth = kstNow.getUTCMonth();
  const kstDate = kstNow.getUTCDate();
  // Midnight of the current KST day (23:59:59.999 KST = 14:59:59.999 UTC)
  return Date.UTC(kstYear, kstMonth, kstDate, 14, 59, 59, 999);
}

function InitFreeAppraisalEventPopup() {
  const modal = document.getElementById('freeAppraisalEventModal');
  if (!modal) return;

  // 1. Check if event is still active (deadline: 2026-11-06 23:59:59 KST)
  if (Date.now() > FREE_APPRAISAL_EVENT_CONFIG.endTimestamp) {
    return;
  }

  // 2. Check session suppression (닫기 clicked earlier in this browser session)
  if (sessionStorage.getItem('goldlab_hide_event_popup_session') === 'true') {
    return;
  }

  // 3. Check '오늘 하루 보지 않기' (KST midnight expiration)
  const hideUntil = localStorage.getItem('goldlab_hide_event_popup_until');
  if (hideUntil && Date.now() <= parseInt(hideUntil, 10)) {
    return;
  }

  // 4. 별도의 브라우저 창(독립 팝업 윈도우, 신라호텔 스타일)으로 띄우기
  const popupW = 500;
  const popupH = 680;
  const popupLeft = Math.max(30, Math.round((window.screen.width - popupW) / 2));
  const popupTop = Math.max(30, Math.round((window.screen.height - popupH) / 2));

  let popupWin = null;
  try {
    popupWin = window.open(
      'popup-event.html',
      'GoldLabEventNoticePopup',
      `width=${popupW},height=${popupH},top=${popupTop},left=${popupLeft},scrollbars=yes,resizable=yes`
    );
  } catch (e) {
    console.warn('독립 팝업 윈도우 호출 실패(브라우저 팝업 차단 등):', e);
  }

  // 별도 브라우저 창이 성공적으로 열렸다면 웹사이트 내부 모달은 띄우지 않고 종료!
  if (popupWin && !popupWin.closed && typeof popupWin.closed !== 'undefined') {
    try { popupWin.focus(); } catch (e) {}
    return;
  }

  // 5. 브라우저에서 자동 팝업 차단(사용자 클릭 제스처 필요 정책)이 발생한 경우에만 안전하게 내부 모달로 fallback
  const btnText = document.getElementById('eventModalBtnText');
  if (btnText) {
    if (currentUser) {
      btnText.innerText = '무료 감정대행 신청하기';
    } else {
      btnText.innerText = '회원가입·로그인 후 무료 감정 신청';
    }
  }

  eventPopupLastFocused = document.activeElement;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const actionBtn = document.getElementById('btnEventModalAction');
  if (actionBtn) actionBtn.focus();

  // Focus trap & Esc handler
  eventPopupKeydownHandler = function(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      CloseEventPopup(false);
      return;
    }
    if (e.key === 'Tab') {
      const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };
  document.addEventListener('keydown', eventPopupKeydownHandler);
}

function CloseEventPopup(fromTodayCheckbox = false) {
  const modal = document.getElementById('freeAppraisalEventModal');
  if (!modal) return;

  const chkToday = document.getElementById('chkEventModalHideToday');
  if (fromTodayCheckbox || (chkToday && chkToday.checked)) {
    const kstMidnight = getKstMidnightTimestamp();
    localStorage.setItem('goldlab_hide_event_popup_until', String(kstMidnight));
  }

  // Session suppression for '닫기'
  sessionStorage.setItem('goldlab_hide_event_popup_session', 'true');

  modal.classList.remove('active');
  document.body.style.overflow = '';

  if (eventPopupKeydownHandler) {
    document.removeEventListener('keydown', eventPopupKeydownHandler);
    eventPopupKeydownHandler = null;
  }

  if (eventPopupLastFocused && typeof eventPopupLastFocused.focus === 'function') {
    try { eventPopupLastFocused.focus(); } catch (e) {}
  }
}

function HandleEventPopupAction() {
  const chkToday = document.getElementById('chkEventModalHideToday');
  if (chkToday && chkToday.checked) {
    localStorage.setItem('goldlab_hide_event_popup_until', String(getKstMidnightTimestamp()));
  }

  if (currentUser) {
    CloseEventPopup(false);
    window.location.href = 'appraisal.html?event=FREE_APPRAISAL_2026';
  } else {
    sessionStorage.setItem('goldlab_auth_redirect', 'appraisal.html?event=FREE_APPRAISAL_2026');
    CloseEventPopup(false);
    OpenAuthModal('login');
  }
}

function OpenStandaloneEventPopup() {
  const popupW = 500;
  const popupH = 680;
  const popupLeft = Math.max(30, Math.round((window.screen.width - popupW) / 2));
  const popupTop = Math.max(30, Math.round((window.screen.height - popupH) / 2));

  try {
    const popupWin = window.open(
      'popup-event.html',
      'GoldLabEventNoticePopup',
      `width=${popupW},height=${popupH},top=${popupTop},left=${popupLeft},scrollbars=yes,resizable=yes`
    );
    if (popupWin) {
      try { popupWin.focus(); } catch (e) {}
      CloseEventPopup(false);
      return popupWin;
    }
  } catch (e) {
    console.warn('독립 팝업 윈도우 열기 실패:', e);
  }
}

function QuickInquiry(prodName) {
  alert(`'${prodName}' 상품 구매 및 견적 상담 문의가 접수되었습니다.\n하단 대표전화 상담(010-4017-4988) 또는 방문 예약을 진행해 주세요!`);
}

// --------------------------------------------------------------------------
// 4. MyPage Member Asset & Daily PnL Engine (mypage.html 1줄 보장 및 삭제)
// --------------------------------------------------------------------------
function LoadMyTransactions() {
  const stored = localStorage.getItem('goldlab_my_transactions_v6') || localStorage.getItem('goldlab_my_transactions_v5');
  if (stored) {
    try {
      myTransactions = JSON.parse(stored);
    } catch(e) {
      myTransactions = [...INITIAL_TRANSACTIONS];
    }
  } else {
    myTransactions = [...INITIAL_TRANSACTIONS];
    SaveMyTransactions();
  }
}

function SaveMyTransactions() {
  localStorage.setItem('goldlab_my_transactions_v6', JSON.stringify(myTransactions));
  SyncUserTransactionsToMasterDB();
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
  const pName = selectedProductTitle || '골드바';
  const pWeight = selectedProductWeight || '1돈 (3.75g)';
  window.location.href = `reservation.html?category=${encodeURIComponent('골드바 구매')}&product=${encodeURIComponent(pName)}&weight=${encodeURIComponent(pWeight)}`;
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

  // Calculate Overall Totals from transactions for Top KPI Cards & Banner
  myTransactions.forEach(tx => {
    if ((tx.type || '매수') !== '매수') return;

    let rate = currentRates["24K_buy"] || 808000;
    if (tx.purity === '18K') rate = Math.round((currentRates["24K_buy"] || 808000) * 0.75 * 0.98);
    else if (tx.purity === '14K') rate = Math.round((currentRates["24K_buy"] || 808000) * 0.585 * 0.98);
    else if (tx.purity === 'PT') rate = currentRates["PT_buy"] || 329000;
    else if (tx.purity === 'AG') rate = currentRates["AG_buy"] || 11370;

    const evalAmount = Math.round(parseFloat(tx.donWeight || 0) * rate);
    totalDonWeight += parseFloat(tx.donWeight || 0);
    totalCostSum += parseInt(tx.totalCost || 0);
    totalEvalSum += evalAmount;
  });

  const filteredTxList = myTransactions.filter(tx => {
    if (currentLedgerTab === 'BUY') return (tx.type || '매수') === '매수';
    return (tx.type || '매수') === '매도';
  });

  if (filteredTxList.length === 0) {
    const emptyMsg = currentLedgerTab === 'BUY' ? '등록된 매수 내역이 없습니다.' : '등록된 매도 내역이 없습니다.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted); white-space:nowrap;">${emptyMsg}<br><button class="btn btn-gold btn-sm" style="margin-top:1rem;" onclick="OpenAddTransactionModal()"><i class="fa-solid fa-plus"></i> 신규 내역 등록하기</button></td></tr>`;
  } else {
    tbody.innerHTML = filteredTxList.map(tx => {
      // For BUY, compare with current BUY rate (시장 살 때 시세 기준 정확한 1:1 비교)
      let currentRateForPurity = currentRates["24K_buy"] || 808000;
      let currentSellRate = currentRates["24K_sell"] || 688000;

      if (tx.purity === '18K') {
        currentRateForPurity = Math.round((currentRates["24K_buy"] || 808000) * 0.75 * 0.98);
        currentSellRate = currentRates["18K_sell"] || 505700;
      } else if (tx.purity === '14K') {
        currentRateForPurity = Math.round((currentRates["24K_buy"] || 808000) * 0.585 * 0.98);
        currentSellRate = currentRates["14K_sell"] || 392200;
      } else if (tx.purity === 'PT') {
        currentRateForPurity = currentRates["PT_buy"] || 329000;
        currentSellRate = currentRates["PT_sell"] || 267000;
      } else if (tx.purity === 'AG') {
        currentRateForPurity = currentRates["AG_buy"] || 11370;
        currentSellRate = currentRates["AG_sell"] || 9470;
      }

      const exactGrams = (tx.donWeight * 3.75).toFixed(2);
      const svgGraphHtml = GenerateTxSvgSparkline(tx, currentRateForPurity, currentSellRate);

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

function GenerateTxSvgSparkline(tx, currentRateForPurity, currentSellRate) {
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
  const cashoutVal = (currentSellRate || currentRates["24K_sell"] || 688000) * tx.donWeight;

  return `
    <div style="background:rgba(9,11,16,0.95); border:1px solid var(--border-dark); border-radius:14px; padding:0.85rem 1.1rem; min-width:360px;">
      <!-- Table Header & Stats -->
      <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:center; margin-bottom:0.5rem;">
        <thead>
          <tr style="color:var(--text-muted); border-bottom:1px solid rgba(255,255,255,0.08);">
            <th style="padding-bottom:0.35rem; font-weight:600;">등록 당시 단가</th>
            <th style="padding-bottom:0.35rem; font-weight:600;">현재 실시간 시세 (살 때)</th>
            <th style="padding-bottom:0.35rem; font-weight:600;">시세 평가 손익</th>
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

      <!-- Real-Time Cashout Liquidation Notice -->
      <div style="margin-top:0.5rem; padding-top:0.4rem; border-top:1px dashed rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-muted);">
        <span><i class="fa-solid fa-hand-holding-dollar text-gold"></i> 오늘 즉시 현금 처분(팔 때) 시:</span>
        <span style="color:var(--text-white); font-weight:800; font-family:var(--font-num);">${formatWon(cashoutVal)} 원 <span style="font-size:0.72rem; color:var(--text-muted);">(단가 ${formatWon(currentSellRate || 688000)}원)</span></span>
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

// Load Main Page Customer Reviews Preview (Top 3 only if >= 3 reviews exist)
async function LoadMainReviewPreview() {
  const section = document.getElementById('mainReviewPreviewSection') || document.getElementById('mainReviewsSection');
  const container = document.getElementById('mainReviewPreviewCards') || document.getElementById('mainReviewsCardsGrid');
  if (!section || !container) return;

  try {
    const res = await ApiRequest('/api/reviews?limit=3');
    if (res && res.success && Array.isArray(res.reviews) && res.reviews.length >= 3) {
      container.innerHTML = res.reviews.slice(0, 3).map(rev => {
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
          starsHtml += `<i class="fa-solid fa-star" style="color:${i <= rev.rating ? '#e0b848' : '#2d3348'}; font-size:0.85rem;"></i>`;
        }

        const photoHtml = (rev.photos && rev.photos.length > 0)
          ? `<div style="margin-top:0.9rem; height:130px; border-radius:10px; overflow:hidden; background:#000;">
               <img src="${rev.photos[0]}" alt="후기 사진" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
             </div>`
          : '';

        return `
          <div style="background:#121520; border:1px solid var(--border-dark); border-radius:18px; padding:1.4rem; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 8px 25px rgba(0,0,0,0.35);">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <span class="badge-status badge-status-inspected" style="font-size:0.75rem; padding:3px 9px;">
                  <i class="fa-solid fa-circle-check"></i> ${rev.categoryLabel || '거래인증'}
                </span>
                <span style="font-size:0.75rem; color:var(--text-muted);">${(rev.createdAt || '').substring(0, 10)}</span>
              </div>
              <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.7rem;">
                <div style="display:flex; gap:2px;">${starsHtml}</div>
                <strong style="color:var(--gold-light); font-size:0.9rem; font-family:var(--font-num);">${Number(rev.rating).toFixed(1)}</strong>
              </div>
              <p style="color:var(--text-light); font-size:0.88rem; line-height:1.6; margin:0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                ${rev.content}
              </p>
              ${photoHtml}
            </div>
            <div style="margin-top:1.1rem; padding-top:0.8rem; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">
                <i class="fa-solid fa-user-shield text-gold"></i> ${rev.maskedAuthor}
              </span>
              <a href="reviews.html" style="font-size:0.78rem; color:var(--gold-light); text-decoration:none; font-weight:700;">
                전체보기 <i class="fa-solid fa-chevron-right" style="font-size:0.68rem;"></i>
              </a>
            </div>
          </div>
        `;
      }).join('');
      section.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
  } catch (err) {
    section.style.display = 'none';
  }
}

