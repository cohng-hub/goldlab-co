/* ==========================================================================
   GoldLab & Co. - Core Application JavaScript Engine
   Real-Time Market Rate Sync & Prominent Chart Engine & VIP PnL System
   ========================================================================== */

// Official Live Rates from Korea Gold Exchange (koreagoldx.co.kr 100% Exact Official Rates)
let REALTIME_STANDARD_RATES = {
  "24K_buy": 841000,
  "24K_sell": 714000,
  "18K_sell": 524800,
  "14K_sell": 407000,
  "PT_buy": 340000,
  "PT_sell": 276000,
  "AG_buy": 11900,
  "AG_sell": 9900
};

let REALTIME_RATE_CHANGES = {
  "24K_buy_diff": -10000,
  "24K_buy_per": -1.19,
  "24K_sell_diff": -1000,
  "24K_sell_per": -0.14,
  "18K_sell_diff": -800,
  "18K_sell_per": -0.15,
  "14K_sell_diff": -600,
  "14K_sell_per": -0.15,
  "PT_sell_diff": -2000,
  "PT_sell_per": -0.72,
  "AG_sell_diff": -110,
  "AG_sell_per": -1.11,
  "date": "2026.09.07"
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
// 1. Auth & Master Admin CRM System
// --------------------------------------------------------------------------
const MASTER_EMAIL = 'goldlabnco@naver.com';
const MASTER_PASS = 'usmpik201663';

let currentMasterView = 'ADMIN';
let currentInspectingMemberId = null;

function GetMasterMembersDB() {
  const cleared = localStorage.getItem('goldlab_samples_cleared');
  const stored = localStorage.getItem('goldlab_master_members_db_v1');
  if (stored !== null) {
    try {
      return JSON.parse(stored);
    } catch(e) { console.error('Master DB parse error:', e); }
  }

  if (cleared === 'true') {
    return [];
  }

  // Pre-populated realistic initial VIP and B2B members for immediate testing
  const initialMembers = [
    {
      id: 'usr_gold_01',
      name: '김골드',
      email: 'gold@goldlab.co.kr',
      phone: '010-8888-9999',
      pass: '1234',
      userType: 'PERSONAL',
      tier: 'VIP PLATINUM MEMBER',
      joinDate: '2026.08.15 14:20',
      note: '종로 본점 VIP 단골 고객 / 순금 골드바 위주 집중 투자',
      transactions: [
        {
          id: 1723700400000,
          date: '2026.08.15',
          type: '매수',
          itemName: '24K 순금 골드바 10돈',
          purity: '24K',
          donWeight: 10,
          unitCost: 680000,
          totalCost: 6800000
        },
        {
          id: 1724218800000,
          date: '2026.08.21',
          type: '매수',
          itemName: '18K 체인 목걸이 3돈',
          purity: '18K',
          donWeight: 3,
          unitCost: 483333,
          totalCost: 1450000
        }
      ]
    },
    {
      id: 'usr_lee_02',
      name: '이서윤',
      email: 'seoyun.lee@naver.com',
      phone: '010-3344-7788',
      pass: '1234',
      userType: 'PERSONAL',
      tier: 'GOLD MEMBER',
      joinDate: '2026.08.28 11:15',
      note: '온라인 시세 조회 후 매수 등록 / 추가 매수 상담 희망',
      transactions: [
        {
          id: 1724823300000,
          date: '2026.08.28',
          type: '매수',
          itemName: '24K 순금 골드바 5돈',
          purity: '24K',
          donWeight: 5,
          unitCost: 690000,
          totalCost: 3450000
        }
      ]
    },
    {
      id: 'usr_biz_03',
      name: '(주)종로골드 주얼리',
      email: 'biz_jongro@goldlab.co.kr',
      phone: '02-765-8888',
      pass: '1234',
      userType: 'BIZ',
      bizName: '(주)종로골드 주얼리',
      bizNo: '101-86-77777',
      tier: 'B2B VIP MEMBER',
      joinDate: '2026.08.10 09:40',
      note: '종로 3가 대형 도매 거래처 / 덩어리 및 백금 바 정기 매입',
      transactions: [
        {
          id: 1723273200000,
          date: '2026.08.10',
          type: '매수',
          itemName: '24K 순금 덩어리 50돈',
          purity: '24K',
          donWeight: 50,
          unitCost: 670000,
          totalCost: 33500000
        },
        {
          id: 1723878000000,
          date: '2026.08.17',
          type: '매수',
          itemName: '백금(PT) 인곳 바 10돈',
          purity: 'PT',
          donWeight: 10,
          unitCost: 420000,
          totalCost: 4200000
        }
      ]
    },
    {
      id: 'usr_park_04',
      name: '박민우',
      email: 'minwoo.park@kakao.com',
      phone: '010-5566-1234',
      pass: '1234',
      userType: 'PERSONAL',
      tier: 'GOLD MEMBER',
      joinDate: '2026.09.02 16:50',
      note: '예물 14K 커플링 등록 고객 / 매도 시세 문의 예정',
      transactions: [
        {
          id: 1725263400000,
          date: '2026.09.02',
          type: '매수',
          itemName: '14K 다이아 커플링 2돈',
          purity: '14K',
          donWeight: 2,
          unitCost: 360000,
          totalCost: 720000
        }
      ]
    }
  ];

  localStorage.setItem('goldlab_master_members_db_v1', JSON.stringify(initialMembers));
  return initialMembers;
}

function SaveMasterMembersDB(members) {
  localStorage.setItem('goldlab_master_members_db_v1', JSON.stringify(members));
}

function SyncUserTransactionsToMasterDB() {
  if (!currentUser || currentUser.role === 'MASTER_ADMIN') return;
  const members = GetMasterMembersDB();
  const idx = members.findIndex(m => m.id === currentUser.id || m.email.toLowerCase() === currentUser.email.toLowerCase());
  if (idx !== -1) {
    members[idx].transactions = [...myTransactions];
    SaveMasterMembersDB(members);
  }
}

function LoadAuthState() {
  const savedUser = localStorage.getItem('goldlab_logged_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
    } catch(e) {
      currentUser = null;
    }
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
  const masterSwitcher = document.getElementById('masterModeSwitcher');

  if (currentUser) {
    const isMaster = currentUser.role === 'MASTER_ADMIN';
    const isBiz = currentUser.userType === 'BIZ';

    if (slot) {
      if (isMaster) {
        slot.innerHTML = `
          <div style="display:inline-flex; align-items:center; gap:0.55rem; background:linear-gradient(135deg, rgba(224,184,72,0.2) 0%, rgba(147,51,234,0.2) 100%); border:1px solid #e0b848; padding:0.35rem 0.85rem; border-radius:30px; white-space:nowrap; box-shadow:0 0 15px rgba(224,184,72,0.35);">
            <span style="color:#f5e4a2; font-weight:900; font-size:0.9rem;"><i class="fa-solid fa-crown" style="color:#e0b848;"></i> 👑 마스터 대표</span>
            <a href="mypage.html?tab=master" style="background:var(--gold-gradient); color:#000; border-radius:20px; padding:0.2rem 0.65rem; font-size:0.8rem; font-weight:800; text-decoration:none;">관제센터</a>
            <button onclick="LogoutUser()" style="background:rgba(255,255,255,0.15); color:var(--text-light); border:none; border-radius:20px; padding:0.2rem 0.6rem; font-size:0.78rem; font-weight:700; cursor:pointer;">로그아웃</button>
          </div>
        `;
      } else {
        const badgeIcon = isBiz ? '<i class="fa-solid fa-building text-gold"></i>' : '<i class="fa-solid fa-circle-user"></i>';
        const userDisplayLabel = isBiz ? `🏢 ${currentUser.name} (사업자)` : `${currentUser.name} 님`;
        slot.innerHTML = `
          <div style="display:inline-flex; align-items:center; gap:0.6rem; background:rgba(224,184,72,0.12); border:1px solid var(--border-dark); padding:0.35rem 0.9rem; border-radius:30px; white-space:nowrap;">
            <span style="color:var(--gold-light); font-weight:800; font-size:0.92rem;">${badgeIcon} ${userDisplayLabel}</span>
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
      myTier.innerHTML = `<i class="fa-solid fa-crown text-gold"></i> ${currentUser.tier || (isBiz ? 'B2B VIP MEMBER' : 'VIP PLATINUM MEMBER')}`;
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
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const pass = (document.getElementById('loginPass')?.value || '').trim();
  const loginUserType = document.getElementById('loginUserTypeSelect')?.value || 'AUTO';

  // 1. MASTER ADMIN AUTHENTICATION
  if (email.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
    if (pass === MASTER_PASS) {
      currentUser = {
        id: 'master_admin',
        name: '황미숙 대표 (마스터)',
        email: MASTER_EMAIL,
        role: 'MASTER_ADMIN',
        userType: 'MASTER',
        tier: '👑 MASTER ADMIN',
        phone: '010-4017-4988'
      };
      localStorage.setItem('goldlab_logged_user', JSON.stringify(currentUser));
      UpdateAuthUI();
      CloseModal('authModal');
      alert(`[👑 마스터 관리자 인증 완료]\n황미숙 대표님, 환영합니다!\n골드랩 전체 회원 및 금 자산 장부 관제센터로 연결합니다.`);
      window.location.href = 'mypage.html?tab=master';
      return;
    } else {
      alert('[로그인 실패] 마스터 관리자 비밀번호가 일치하지 않습니다. 다시 확인해 주세요.');
      return;
    }
  }

  // 2. REGULAR / B2B MEMBER AUTHENTICATION
  const members = GetMasterMembersDB();
  let foundMember = members.find(m => m.email.toLowerCase() === email.toLowerCase());

  let isBiz = email.includes('biz') || loginUserType === 'BIZ';
  const name = email.split('@')[0];

  if (!foundMember) {
    // If not in DB yet, auto-register as realistic member record
    const now = new Date();
    const joinDate = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    foundMember = {
      id: 'usr_' + Date.now(),
      name: isBiz ? '(주)종로골드 주얼리' : (name === 'gold' ? '김골드' : name),
      email: email,
      phone: isBiz ? '02-765-8888' : '010-8888-9999',
      pass: pass || '1234',
      userType: isBiz ? 'BIZ' : 'PERSONAL',
      bizName: isBiz ? '(주)종로골드 주얼리' : '',
      bizNo: isBiz ? '101-86-77777' : '',
      tier: isBiz ? 'B2B VIP MEMBER' : 'VIP PLATINUM MEMBER',
      joinDate: joinDate,
      note: '온라인 로그인 고객',
      transactions: []
    };
    members.unshift(foundMember);
    SaveMasterMembersDB(members);
  }

  currentUser = foundMember;
  localStorage.setItem('goldlab_logged_user', JSON.stringify(currentUser));

  // Sync member transactions to personal ledger
  if (foundMember.transactions && foundMember.transactions.length > 0) {
    myTransactions = [...foundMember.transactions];
  } else {
    myTransactions = [...INITIAL_TRANSACTIONS];
    foundMember.transactions = [...myTransactions];
    SaveMasterMembersDB(members);
  }
  SaveMyTransactions();

  UpdateAuthUI();
  CloseModal('authModal');

  if (currentUser.userType === 'BIZ') {
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
  const name = (document.getElementById('signupName')?.value || '').trim();
  const email = (document.getElementById('signupEmail')?.value || '').trim();
  const pass = (document.getElementById('signupPass')?.value || '').trim();
  const phone = (document.getElementById('signupPhone')?.value || '').trim();
  const isBiz = currentSignupUserType === 'BIZ';
  const bizName = (document.getElementById('signupBizName')?.value || '').trim() || name + ' 주얼리';
  const bizNo = (document.getElementById('signupBizNo')?.value || '').trim() || '101-86-00000';

  // Guard against master email registration
  if (email.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
    alert('마스터 관리자 계정 아이디로는 일반 회원가입을 하실 수 없습니다. 로그인 창에서 마스터 비밀번호로 로그인해 주세요.');
    SwitchAuthTab('login');
    return;
  }

  const members = GetMasterMembersDB();
  const existing = members.find(m => m.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    alert('이미 등록된 이메일 계정입니다. 로그인해 주세요.');
    SwitchAuthTab('login');
    return;
  }

  const now = new Date();
  const joinDate = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const newUser = {
    id: 'usr_' + Date.now(),
    name: isBiz ? bizName : name,
    email: email,
    phone: phone,
    pass: pass || '1234',
    userType: isBiz ? 'BIZ' : 'PERSONAL',
    bizName: isBiz ? bizName : '',
    bizNo: isBiz ? bizNo : '',
    tier: isBiz ? 'B2B MEMBER' : 'GOLD MEMBER',
    joinDate: joinDate,
    note: isBiz ? '신규 B2B 도매 가입' : '신규 온라인 가입 고객',
    transactions: []
  };

  members.unshift(newUser);
  SaveMasterMembersDB(members);

  currentUser = newUser;
  localStorage.setItem('goldlab_logged_user', JSON.stringify(currentUser));
  myTransactions = [];
  SaveMyTransactions();

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
    let rate = currentRates["24K_sell"] || 470000;
    if (tx.purity === '18K') rate = currentRates["18K_sell"] || 345000;
    else if (tx.purity === '14K') rate = currentRates["14K_sell"] || 268000;
    else if (tx.purity === 'PT') rate = currentRates["PT_sell"] || 185000;
    else if (tx.purity === 'AG') rate = currentRates["AG_sell"] || 5400;

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
        let rate = currentRates["24K_sell"] || 470000;
        if (tx.purity === '18K') rate = currentRates["18K_sell"] || 345000;
        else if (tx.purity === '14K') rate = currentRates["14K_sell"] || 268000;
        else if (tx.purity === 'PT') rate = currentRates["PT_sell"] || 185000;
        else if (tx.purity === 'AG') rate = currentRates["AG_sell"] || 5400;

        const evalAmt = rate * tx.donWeight;
        const diff = evalAmt - tx.totalCost;
        const ratePct = tx.totalCost > 0 ? ((diff / tx.totalCost) * 100).toFixed(2) : '0.00';
        const isPlus = diff >= 0;
        const sparkline = GenerateTxSvgSparkline(tx, rate);

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

function ExportMasterMembersCSV() {
  const members = GetMasterMembersDB();
  if (members.length === 0) {
    alert('내보낼 회원 데이터가 없습니다.');
    return;
  }

  let csvContent = '\uFEFF가입일시,회원구분,성함/상호명,대표자명,사업자번호,연락처,아이디(이메일),보유금중량(돈),보유금중량(g),총매수원금(원),실시간평가금액(원),평가손익(원),수익률(%),관리자메모\n';

  members.forEach(m => {
    const s = CalculateMemberAssetSummary(m);
    const isBiz = m.userType === 'BIZ';
    const row = [
      `"${m.joinDate || ''}"`,
      `"${isBiz ? 'B2B 도매 사업자' : '일반 고객 VIP'}"`,
      `"${m.name || ''}"`,
      `"${isBiz ? (m.bizName || m.name) : m.name}"`,
      `"${m.bizNo || '-'}"`,
      `"${m.phone || ''}"`,
      `"${m.email || ''}"`,
      `"${s.totalDonWeight.toFixed(2)}"`,
      `"${s.totalGrams}"`,
      `"${s.totalCostSum}"`,
      `"${s.totalEvalSum}"`,
      `"${s.diff}"`,
      `"${s.profitRate}%"`,
      `"${(m.note || '').replace(/"/g, '""')}"`
    ];
    csvContent += row.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  a.href = url;
  a.download = `골드랩앤코_전체회원및자산장부_${todayStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
    email: `test${randomNum}@goldlab.co.kr`,
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
  localStorage.setItem('goldlab_samples_cleared', 'true');

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
  localStorage.setItem('goldlab_samples_cleared', 'true');
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
  alert(`'${prodName}' 상품 구매 및 견적 상담 문의가 접수되었습니다.\n하단 대표전화 상담(010-4017-4988) 또는 방문 예약을 진행해 주세요!`);
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

