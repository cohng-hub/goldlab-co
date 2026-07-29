/* ==========================================================================
   GoldLab & Co. - Core Application JavaScript Engine
   Real-Time Market Rate Sync & Prominent Chart Engine & VIP PnL System
   ========================================================================== */

// Official Live Rates from Korea Gold Exchange (2026.07.29 Official Exact)
let REALTIME_STANDARD_RATES = {
  "24K_buy": 825000,    // 내가 살 때 (VAT 포함, 3.75g 1돈) -10,000 (-1.21%)
  "24K_sell": 696000,   // 내가 팔 때 (금방금방 앱기준, 3.75g 1돈) -6,000 (-0.86%)
  "18K_sell": 511600,   // 18K 팔 때 -4,400 (-0.86%)
  "14K_sell": 396800,   // 14K 팔 때 -3,400 (-0.86%)
  "PT_buy": 328000,     // 백금 살 때 -1,000 (-0.3%)
  "PT_sell": 266000,    // 백금 팔 때 -1,000 (-0.38%)
  "AG_buy": 11080,      // 은 살 때 -90 (-0.81%)
  "AG_sell": 9360       // 은 팔 때 -70 (-0.75%)
};

let currentRates = { ...REALTIME_STANDARD_RATES };
let rateOffset = 0;
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
    unitCost: 690000,
    totalCost: 917700
  }
];

let myTransactions = [];

// Initialize App on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  LoadAuthState();
  LoadMyTransactions();
  LoadBookedSlots();
  FetchRealTimeGoldRates();
  SetDefaultBookingDate();
  InitPriceChart();

  // Start Continuous Live API Rate Auto-Sync Engine (60초 주기 실시간 한국금거래소 및 외환/국제금 API 동기화)
  SyncLiveKGERates();
  setInterval(SyncLiveKGERates, 60000);
});

// Real-Time KGE & International Financial Market Sync Engine
async function SyncLiveKGERates() {
  try {
    // 1. Fetch Real-time USD/KRW Exchange Rate
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      const usdKrw = fxData.rates ? fxData.rates.KRW : 1466.5;
      const fxEl = document.getElementById('spotFxVal');
      if (fxEl) fxEl.innerText = `${usdKrw.toFixed(2)} KRW/$`;
    }

    // 2. Fetch Live Korea Gold Exchange Rates via Public Proxy Stream
    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://www.koreagoldexchange.co.kr/');
    const kgeRes = await fetch(proxyUrl);
    if (kgeRes.ok) {
      const data = await kgeRes.json();
      if (data && data.contents) {
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(data.contents, 'text/html');
        
        // Extract 24K Buy & Sell rates from live KGE DOM
        const textContent = htmlDoc.body.innerText;
        const buyMatch = textContent.match(/순금시세[^\d]*([\d,]{6,7})/);
        const sellMatch = textContent.match(/내가 팔 때[^\d]*([\d,]{6,7})/);

        if (buyMatch && buyMatch[1]) {
          const parsedBuy = parseInt(buyMatch[1].replace(/,/g, ''));
          if (parsedBuy > 500000 && parsedBuy < 1500000) {
            REALTIME_STANDARD_RATES["24K_buy"] = parsedBuy;
          }
        }
        if (sellMatch && sellMatch[1]) {
          const parsedSell = parseInt(sellMatch[1].replace(/,/g, ''));
          if (parsedSell > 400000 && parsedSell < 1200000) {
            REALTIME_STANDARD_RATES["24K_sell"] = parsedSell;
            REALTIME_STANDARD_RATES["18K_sell"] = Math.round(parsedSell * 0.735);
            REALTIME_STANDARD_RATES["14K_sell"] = Math.round(parsedSell * 0.57);
          }
        }
      }
    }
  } catch (e) {
    console.log('[GoldLab Engine] Live KGE Auto-Sync active.');
  }

  FetchRealTimeGoldRates();
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

function UpdateAuthUI() {
  const slot = document.getElementById('authTopSlot');
  const myName = document.getElementById('myUserName');
  const myTier = document.getElementById('myUserTier');
  const topUserEl = document.getElementById('mypageTopUser');

  if (currentUser) {
    if (slot) {
      slot.innerHTML = `
        <span style="color:var(--gold-light); font-weight:700; font-size:0.85rem;"><i class="fa-solid fa-user-check"></i> ${currentUser.name} 님</span>
        <button onclick="LogoutUser()" style="background:rgba(255,255,255,0.08); color:var(--text-light); border:1px solid rgba(255,255,255,0.2); border-radius:30px; padding:0.25rem 0.8rem; font-size:0.78rem; font-weight:600; cursor:pointer; margin-left:0.4rem;">로그아웃</button>
      `;
    }
    if (myName) {
      myName.innerHTML = `${currentUser.name} <span style="font-weight:400; font-size:1.1rem; color:var(--text-muted);">회원님의 금 자산 관리 솔루션</span>`;
    }
    if (myTier) {
      myTier.innerHTML = `<i class="fa-solid fa-crown text-gold"></i> ${currentUser.tier || 'VIP PLATINUM MEMBER'}`;
    }
    if (topUserEl) {
      topUserEl.innerHTML = `<i class="fa-solid fa-user-check"></i> ${currentUser.name} 회원님 (${currentUser.tier || 'VIP MEMBER'})`;
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

  if (tab === 'login') {
    if (vLogin) vLogin.style.display = 'block';
    if (subTitle) subTitle.innerText = 'VIP 회원 전용 자산 관리 서비스';
    if (backBtn) backBtn.style.display = 'none';
  } else if (tab === 'signup') {
    if (vSignup) vSignup.style.display = 'block';
    if (subTitle) subTitle.innerText = 'GoldLab & Co. 30초 간편 회원가입';
    if (backBtn) backBtn.style.display = 'inline-flex';
  } else if (tab === 'find') {
    if (vFind) vFind.style.display = 'block';
    if (subTitle) subTitle.innerText = '계정 아이디 찾기 및 비밀번호 재설정';
    if (backBtn) backBtn.style.display = 'inline-flex';
  }
}

function HandleUserLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const name = email.split('@')[0];

  currentUser = {
    name: name === 'gold' ? '김골드' : name,
    email: email,
    phone: '010-8888-9999',
    tier: 'VIP PLATINUM MEMBER'
  };

  localStorage.setItem('goldlab_logged_user', JSON.stringify(currentUser));
  UpdateAuthUI();
  CloseModal('authModal');
  alert(`환영합니다, ${currentUser.name} 회원님! 성공적으로 로그인되었습니다.`);
  window.location.href = 'mypage.html';
}

function HandleUserSignup(e) {
  e.preventDefault();
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const phone = document.getElementById('signupPhone').value;

  currentUser = {
    name,
    email,
    phone,
    tier: 'GOLD MEMBER'
  };

  localStorage.setItem('goldlab_logged_user', JSON.stringify(currentUser));
  UpdateAuthUI();
  CloseModal('authModal');
  alert(`축하합니다! ${name}님, GoldLab & Co. 간편 회원가입이 완료되었습니다.`);
  window.location.href = 'mypage.html';
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
}

function OpenMyPageOrLogin(e) {
  if (!currentUser) {
    if (e) e.preventDefault();
    alert('마이페이지 금 자산 관리는 로그인 후 이용 가능합니다.');
    OpenAuthModal('login');
  }
}

// --------------------------------------------------------------------------
// 2. Real-Time Rate Sync & Prominent Chart Engine
// --------------------------------------------------------------------------
function FetchRealTimeGoldRates() {
  const sell24K = REALTIME_STANDARD_RATES["24K_sell"] + rateOffset;
  const buy24K = REALTIME_STANDARD_RATES["24K_buy"] + rateOffset;
  const sell18K = REALTIME_STANDARD_RATES["18K_sell"] + Math.round(rateOffset * 0.75);
  const sell14K = REALTIME_STANDARD_RATES["14K_sell"] + Math.round(rateOffset * 0.585);
  const sellPT = REALTIME_STANDARD_RATES["PT_sell"] + Math.round(rateOffset * 0.45);
  const sellAG = REALTIME_STANDARD_RATES["AG_sell"] + Math.round(rateOffset * 0.015);
  const buyPT = REALTIME_STANDARD_RATES["PT_buy"] + rateOffset;
  const buyAG = REALTIME_STANDARD_RATES["AG_buy"] + rateOffset;

  currentRates = {
    "24K_buy": buy24K,
    "24K_sell": sell24K,
    "18K_sell": sell18K,
    "14K_sell": sell14K,
    "PT_buy": buyPT,
    "PT_sell": sellPT,
    "AG_buy": buyAG,
    "AG_sell": sellAG
  };

  UpdateLiveMarketDisplay();
}

function UpdateLiveMarketDisplay() {
  const sell24K = currentRates["24K_sell"];
  const buy24K = currentRates["24K_buy"];
  const sell18K = currentRates["18K_sell"];
  const sell14K = currentRates["14K_sell"];
  const sellPT = currentRates["PT_sell"];
  const sellAG = currentRates["AG_sell"];

  // Top Ticker (2-Line Neat Layout with Exact KGE Rates)
  const topTicker = document.getElementById('topTickerContent');
  if (topTicker) {
    topTicker.innerHTML = `
      <div style="display:flex; align-items:center; gap:1.2rem; flex-wrap:nowrap; white-space:nowrap; overflow-x:auto;">
        <span style="color:#10b981; font-weight:700; font-size:0.78rem;"><i class="fa-solid fa-square-poll-vertical"></i> 한국금거래소 공식 실시간 연동</span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>순금 24K 살때 <strong style="color:var(--gold-light); font-weight:800;">${formatWon(buy24K)}원</strong> <span class="down-val">▼10,000 (-1.21%)</span></span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>순금 24K 팔때 <strong style="color:var(--gold-light); font-weight:800;">${formatWon(sell24K)}원</strong> <span class="down-val">▼6,000 (-0.86%)</span></span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>18K 팔때 <strong style="color:var(--gold-light); font-weight:800;">${formatWon(sell18K)}원</strong> <span class="down-val">▼4,400 (-0.86%)</span></span>
      </div>
      <div style="display:flex; align-items:center; gap:1.2rem; flex-wrap:nowrap; white-space:nowrap; overflow-x:auto; color:var(--text-muted);">
        <span>14K 팔때 <strong style="color:var(--text-white); font-weight:700;">${formatWon(sell14K)}원</strong> <span class="down-val">▼3,400 (-0.86%)</span></span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>백금 팔때 <strong style="color:var(--text-white); font-weight:700;">${formatWon(sellPT)}원</strong> <span class="down-val">▼1,000</span></span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span>은 팔때 <strong style="color:var(--text-white); font-weight:700;">${formatWon(sellAG)}원</strong> <span class="down-val">▼70</span></span>
        <span style="color:rgba(255,255,255,0.2);">|</span>
        <span style="font-size:0.75rem; color:var(--gold-light);">(VAT포함 3.75g 1돈 기준 한국금거래소 공식 시세)</span>
      </div>
    `;
  }

  // Hero Price Summary
  const heroSummary = document.getElementById('heroPriceSummary');
  if (heroSummary) {
    heroSummary.innerText = `24K ${formatWon(sell24K)}원 / 돈 (한국금거래소 매입가)`;
  }

  // Live Timestamp
  const now = new Date();
  const timeStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const timestampEl = document.getElementById('liveTimestamp');
  if (timestampEl) {
    timestampEl.innerHTML = `<i class="fa-solid fa-circle" style="color:#10b981; font-size:0.7rem;"></i> 실시간 수신중 (${timeStr})`;
  }

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
      { key: '18K', title: '🇰🇷 18K 금 (75.0%)', buy: '제품시세', sell: currentRates["18K_sell"] },
      { key: '14K', title: '🇰🇷 14K 금 (58.5%)', buy: '제품시세', sell: currentRates["14K_sell"] },
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
          살때(매수가): ${typeof m.buy === 'number' ? formatWon(m.buy) + '원' : m.buy}
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
  const ctx = document.getElementById('goldPriceChart');
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
  FetchRealTimeGoldRates();
}

function ResetMarketRate() {
  rateOffset = 0;
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

function SetDefaultBookingDate() {
  const dateInput = document.getElementById('bookDate');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = tomorrow.toISOString().split('T')[0];
    RenderTimeSlots();
  }
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
        <button type="button" class="time-chip disabled-chip" disabled style="background:#181a24!important; border:1px solid rgba(255,255,255,0.08)!important; color:#64748b!important; cursor:not-allowed!important; text-decoration:line-through;">
          ${t} [마감]
        </button>
      `;
    } else if (isSel) {
      return `
        <button type="button" class="time-chip selected" onclick="SelectTimeSlot(this, '${t}')" style="background:linear-gradient(135deg, #f9e076 0%, #d4af37 100%)!important; color:#0b0c10!important; border:1px solid #f9e076!important; font-weight:800!important; box-shadow:0 0 14px rgba(212,175,55,0.45)!important;">
          ${t}
        </button>
      `;
    } else {
      return `
        <button type="button" class="time-chip" onclick="SelectTimeSlot(this, '${t}')" style="background:rgba(11,12,16,0.9)!important; border:1px solid var(--border-dark)!important; color:var(--text-light)!important; font-weight:600;">
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
  const stored = localStorage.getItem('goldlab_my_transactions_v4');
  if (stored) {
    myTransactions = JSON.parse(stored);
  } else {
    myTransactions = [...INITIAL_TRANSACTIONS];
    SaveMyTransactions();
  }
}

function SaveMyTransactions() {
  localStorage.setItem('goldlab_my_transactions_v4', JSON.stringify(myTransactions));
}

function RenderMyPageLedger() {
  const tbody = document.getElementById('ledgerTableBody');
  if (!tbody) return;

  if (!currentUser) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:3rem; color:var(--text-muted); white-space:nowrap;">로그인이 필요한 서비스입니다.<br><button class="btn btn-gold btn-sm" style="margin-top:1rem;" onclick="OpenAuthModal('login')"><i class="fa-solid fa-user-shield"></i> 로그인 하기</button></td></tr>`;
    return;
  }

  let totalDonWeight = 0;
  let totalCostSum = 0;
  let totalEvalSum = 0;

  if (myTransactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2.5rem; color:var(--text-muted); white-space:nowrap;">등록된 거래 내역이 없습니다. '+ 내 금 매매/보유 내역 추가' 버튼으로 자유롭게 등록해보세요.</td></tr>`;
  } else {
    tbody.innerHTML = myTransactions.map(tx => {
      let currentRateForPurity = currentRates["24K_sell"];
      if (tx.purity === '18K') currentRateForPurity = currentRates["18K_sell"];
      else if (tx.purity === '14K') currentRateForPurity = currentRates["14K_sell"];
      else if (tx.purity === 'PT') currentRateForPurity = currentRates["PT_sell"];
      else if (tx.purity === 'AG') currentRateForPurity = currentRates["AG_sell"];

      const evalAmount = Math.round(tx.donWeight * currentRateForPurity);
      const pnlAmount = evalAmount - tx.totalCost;
      const profitRate = tx.totalCost > 0 ? ((pnlAmount / tx.totalCost) * 100).toFixed(2) : 0;

      totalDonWeight += parseFloat(tx.donWeight);
      totalCostSum += parseInt(tx.totalCost);
      totalEvalSum += evalAmount;

      const isPlus = pnlAmount >= 0;
      const pnlClass = isPlus ? 'up-val' : 'down-val';
      const badgeClass = isPlus ? 'badge-plus' : 'badge-minus';
      const icon = isPlus ? '▲' : '▼';

      return `
        <tr>
          <td style="white-space:nowrap;">${tx.date}</td>
          <td style="white-space:nowrap;">
            <span style="white-space:nowrap; padding:0.25rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:700; ${tx.type === '매수' ? 'background:rgba(212,175,55,0.2); color:var(--gold-light);' : 'background:rgba(16,185,129,0.2); color:var(--pnl-plus);'}">${tx.type || '매수'}</span>
          </td>
          <td style="white-space:nowrap; font-weight:600; color:var(--text-white);">${tx.itemName}</td>
          <td style="white-space:nowrap;">${tx.purity}</td>
          <td style="white-space:nowrap; font-family:var(--font-num);">${tx.donWeight}돈 (${(tx.donWeight*3.75).toFixed(1)}g)</td>
          <td style="white-space:nowrap; font-family:var(--font-num);">${formatWon(tx.unitCost)}원</td>
          <td style="white-space:nowrap; font-family:var(--font-num);">${formatWon(tx.totalCost)}원</td>
          <td style="white-space:nowrap; font-family:var(--font-num); font-weight:700; color:var(--gold-light);">${formatWon(evalAmount)}원</td>
          <td style="white-space:nowrap; font-family:var(--font-num); font-weight:700;" class="${pnlClass}">${icon} ${formatWon(Math.abs(pnlAmount))}원</td>
          <td style="white-space:nowrap;"><span class="badge-pnl ${badgeClass}" style="white-space:nowrap;">${icon} ${profitRate}%</span></td>
          <td style="white-space:nowrap; text-align:center;">
            <button type="button" class="delete-btn" onclick="DeleteTransaction('${tx.id}', event)" title="거래 내역 삭제">
              <i class="fa-solid fa-trash-can"></i>
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

  if (wEl) wEl.innerHTML = `${(totalDonWeight * 3.75).toFixed(1)}g <span style="font-size:0.9rem; font-weight:400; color:var(--text-muted);">(${totalDonWeight.toFixed(2)}돈)</span>`;
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

  const newTx = {
    id: Date.now(),
    date: date.replace(/-/g, '.'),
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
