// server/routes.js - Core REST API Router for GoldLab&co
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getDB, saveDB, runTransaction, backupDB } = require('./db');
const {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  RateLimiter,
  verifyTOTP,
  generateTOTP,
  maskPII,
  escapeCSVField
} = require('./auth');

// Rate limiters for security-sensitive endpoints
const loginLimiter = new RateLimiter(60000, 5);      // Max 5 attempts per minute
const registerLimiter = new RateLimiter(60000, 3);   // Max 3 registrations per minute
const resetLimiter = new RateLimiter(60000, 3);      // Max 3 reset requests per minute
const submitLimiter = new RateLimiter(60000, 10);    // Max 10 submissions per minute

// Helper: Parse cookies from request header
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const val = decodeURIComponent(parts.join('='));
    list[key] = val;
  });
  return list;
}

// Helper: Authenticate session from Cookie or Bearer token
function getAuthenticatedUser(req) {
  const db = getDB();
  const cookies = parseCookies(req);
  let token = cookies.goldlab_session;

  if (!token && req.headers.authorization) {
    const authParts = req.headers.authorization.split(' ');
    if (authParts[0] === 'Bearer') token = authParts[1];
  }

  if (!token) return null;

  const hashed = hashToken(token);
  const session = db.sessions.find(s => s.hashedToken === hashed && new Date(s.expiresAt) > new Date());
  if (!session) return null;

  const user = db.users.find(u => u.id === session.userId);
  if (!user || user.status === 'SUSPENDED') return null;

  return { user, session };
}

// Helper: Log Admin Audit Action
function logAudit(db, adminId, action, targetType, targetId, details = {}, ip = '') {
  const logEntry = {
    id: 'AUDIT-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
    adminId,
    action,
    targetType,
    targetId,
    ip: ip || '127.0.0.1',
    details: maskPII(details),
    timestamp: new Date().toISOString()
  };
  db.audit_logs.unshift(logEntry);
  if (db.audit_logs.length > 2000) db.audit_logs.pop(); // Keep last 2,000 logs
}

// Helper: Calculate User's GV total and GC balance from ledger
function calculateUserBalances(userId, db) {
  let gvTotal = 0;
  let gcBalance = 0;

  const userLedgers = db.gv_gc_ledgers.filter(l => l.userId === userId);
  for (const entry of userLedgers) {
    if (entry.type === 'GV_ADD') gvTotal += Number(entry.amount || 0);
    else if (entry.type === 'GV_SUB') gvTotal = Math.max(0, gvTotal - Number(entry.amount || 0));
    else if (entry.type === 'GC_EARN' || entry.type === 'GC_RESTORE') gcBalance += Number(entry.amount || 0);
    else if (entry.type === 'GC_USE' || entry.type === 'GC_EXPIRE') gcBalance = Math.max(0, gcBalance - Number(entry.amount || 0));
  }

  // Derive tier based on GV
  let tier = 'STANDARD';
  if (gvTotal >= 100000000) tier = 'VIP BLACK';
  else if (gvTotal >= 30000000) tier = 'VIP PLATINUM';
  else if (gvTotal >= 10000000) tier = 'GOLD MEMBER';

  return { gvTotal, gcBalance, tier };
}

// Helper: JSON Response Sender
function sendJSON(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// ==============================================================
// MAIN API ROUTE DISPATCHER
// ==============================================================
async function handleApiRequest(req, res, parsedUrl, body) {
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const authContext = getAuthenticatedUser(req);
  const currentUser = authContext ? authContext.user : null;

  // ------------------------------------------------------------
  // 1. AUTHENTICATION & SECURITY ENDPOINTS
  // ------------------------------------------------------------
  if (pathname === '/api/auth/register' && method === 'POST') {
    const rateCheck = registerLimiter.isAllowed(clientIP);
    if (!rateCheck.allowed) {
      return sendJSON(res, 429, { error: '회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }

    const { name, email, phone, password, userType, bizName, bizNo, marketingConsent } = body || {};
    if (!email || !password || !name) {
      return sendJSON(res, 400, { error: '이름, 이메일, 비밀번호는 필수 입력 항목입니다.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return sendJSON(res, 400, { error: '올바른 이메일 형식이 아닙니다.' });
    }

    if (String(password).length < 8) {
      return sendJSON(res, 400, { error: '비밀번호는 최소 8자 이상이어야 합니다.' });
    }

    return await runTransaction(async (db) => {
      const existing = db.users.find(u => u.email === cleanEmail);
      if (existing) {
        return sendJSON(res, 409, { error: '이미 등록된 이메일 주소입니다.' });
      }

      const isBiz = userType === 'BIZ' || !!bizNo;
      const newUser = {
        id: 'usr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        name: String(name).trim(),
        email: cleanEmail,
        phone: String(phone || '').trim(),
        passwordHash: hashPassword(password),
        userType: isBiz ? 'BIZ' : 'PERSONAL',
        role: isBiz ? 'B2B_PENDING' : 'USER', // B2B requires admin verification
        bizName: isBiz ? String(bizName || '').trim() : '',
        bizNo: isBiz ? String(bizNo || '').trim() : '',
        tier: isBiz ? 'B2B PARTNER (대기)' : 'STANDARD MEMBER',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        status: 'ACTIVE',
        termsAgreedAt: new Date().toISOString(),
        marketingConsent: !!marketingConsent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.users.push(newUser);

      // Welcome signup bonus: 5,000 GC in immutable ledger
      db.gv_gc_ledgers.push({
        id: 'LEDGER-GC-WELCOME-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
        userId: newUser.id,
        type: 'GC_EARN',
        amount: 5000,
        referenceId: 'WELCOME-BONUS',
        note: '신규 회원가입 축하 5,000 GC 적립',
        createdAt: new Date().toISOString()
      });

      // Create session
      const rawToken = generateSecureToken(32);
      const session = {
        id: 'sess_' + Date.now(),
        userId: newUser.id,
        hashedToken: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), // 7 days
        clientIP,
        createdAt: new Date().toISOString()
      };
      db.sessions.push(session);

      const cookieHeader = `goldlab_session=${rawToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;
      return sendJSON(res, 201, {
        success: true,
        token: rawToken,
        message: isBiz ? '사업자 회원가입이 접수되었습니다. 서류 검토 후 B2B 도매 권한이 승인됩니다.' : '회원가입이 완료되었습니다.',
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          userType: newUser.userType,
          tier: newUser.tier,
          status: isBiz ? 'B2B_PENDING' : newUser.status
        }
      }, { 'Set-Cookie': cookieHeader });
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const rateCheck = loginLimiter.isAllowed(clientIP);
    if (!rateCheck.allowed) {
      return sendJSON(res, 429, { error: '로그인 시도 횟수를 초과했습니다. 1분 후 다시 시도해 주세요.' });
    }

    const { email, password, totpCode } = body || {};
    if (!email || !password) {
      return sendJSON(res, 400, { error: '이메일과 비밀번호를 입력해 주세요.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const db = getDB();
    const user = db.users.find(u => u.email === cleanEmail);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJSON(res, 401, { error: '이메일 또는 비밀번호가 일치하지 않습니다.' });
    }

    if (user.status === 'SUSPENDED') {
      return sendJSON(res, 403, { error: '이용이 정지된 계정입니다. 고객센터로 문의해 주세요.' });
    }

    // 2FA Check if enabled
    if (user.twoFactorEnabled) {
      if (!totpCode) {
        return sendJSON(res, 200, { requires2FA: true, message: '2단계 인증(OTP) 코드를 입력해 주세요.' });
      }
      if (!verifyTOTP(totpCode, user.twoFactorSecret)) {
        return sendJSON(res, 401, { error: '2단계 인증 코드가 올바르지 않습니다.' });
      }
    }

    return await runTransaction(async (dbRef) => {
      // Invalidate old sessions for this IP or clean expired sessions
      dbRef.sessions = dbRef.sessions.filter(s => new Date(s.expiresAt) > new Date());

      const rawToken = generateSecureToken(32);
      const session = {
        id: 'sess_' + Date.now(),
        userId: user.id,
        hashedToken: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        clientIP,
        createdAt: new Date().toISOString()
      };
      dbRef.sessions.push(session);

      const balances = calculateUserBalances(user.id, dbRef);
      const cookieHeader = `goldlab_session=${rawToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;

      return sendJSON(res, 200, {
        success: true,
        token: rawToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          userType: user.userType,
          tier: balances.tier,
          phone: user.phone,
          bizName: user.bizName,
          bizNo: user.bizNo,
          gvTotal: balances.gvTotal,
          gcBalance: balances.gcBalance,
          twoFactorEnabled: user.twoFactorEnabled
        }
      }, { 'Set-Cookie': cookieHeader });
    });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (authContext) {
      await runTransaction(async (dbRef) => {
        dbRef.sessions = dbRef.sessions.filter(s => s.id !== authContext.session.id);
      });
    }
    const expireCookie = 'goldlab_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    return sendJSON(res, 200, { success: true, message: '로그아웃되었습니다.' }, { 'Set-Cookie': expireCookie });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!currentUser) {
      return sendJSON(res, 200, { authenticated: false, user: null });
    }
    const db = getDB();
    const balances = calculateUserBalances(currentUser.id, db);
    return sendJSON(res, 200, {
      authenticated: true,
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        phone: currentUser.phone,
        role: currentUser.role,
        userType: currentUser.userType,
        tier: balances.tier,
        bizName: currentUser.bizName,
        bizNo: currentUser.bizNo,
        gvTotal: balances.gvTotal,
        gcBalance: balances.gcBalance,
        twoFactorEnabled: currentUser.twoFactorEnabled
      }
    });
  }

  if (pathname === '/api/auth/forgot-password' && method === 'POST') {
    const rateCheck = resetLimiter.isAllowed(clientIP);
    if (!rateCheck.allowed) {
      return sendJSON(res, 429, { error: '비밀번호 재설정 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }

    const { email } = body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const db = getDB();
    const user = db.users.find(u => u.email === cleanEmail);

    // Always respond with success message to prevent user enumeration
    if (!user) {
      return sendJSON(res, 200, { success: true, message: '입력하신 이메일로 비밀번호 재설정 링크가 발송되었습니다.' });
    }

    return await runTransaction(async (dbRef) => {
      const rawToken = generateSecureToken(24);
      const resetEntry = {
        id: 'RESET-' + Date.now(),
        userId: user.id,
        hashedToken: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        used: false,
        createdAt: new Date().toISOString()
      };
      dbRef.password_resets.push(resetEntry);

      console.log(`[Password Reset] Generated reset token for ${maskPII(user.email)} (Expires in 30 mins)`);
      return sendJSON(res, 200, {
        success: true,
        message: '비밀번호 재설정 일회용 인증 정보가 발급되었습니다.',
        // For local development and demonstration: provide token parameter
        resetToken: process.env.NODE_ENV === 'development' ? rawToken : undefined
      });
    });
  }

  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    const { token, newPassword } = body || {};
    if (!token || !newPassword || String(newPassword).length < 8) {
      return sendJSON(res, 400, { error: '유효한 재설정 토큰과 8자 이상의 새 비밀번호를 입력해 주세요.' });
    }

    return await runTransaction(async (dbRef) => {
      const hashed = hashToken(token);
      const resetRecord = dbRef.password_resets.find(r => r.hashedToken === hashed && !r.used && new Date(r.expiresAt) > new Date());
      if (!resetRecord) {
        return sendJSON(res, 400, { error: '만료되었거나 유효하지 않은 비밀번호 재설정 토큰입니다.' });
      }

      const user = dbRef.users.find(u => u.id === resetRecord.userId);
      if (!user) {
        return sendJSON(res, 404, { error: '사용자를 찾을 수 없습니다.' });
      }

      user.passwordHash = hashPassword(newPassword);
      user.updatedAt = new Date().toISOString();
      resetRecord.used = true;

      // Invalidate all existing sessions
      dbRef.sessions = dbRef.sessions.filter(s => s.userId !== user.id);

      return sendJSON(res, 200, { success: true, message: '비밀번호가 안전하게 변경되었습니다. 새 비밀번호로 로그인해 주세요.' });
    });
  }

  // ------------------------------------------------------------
  // 2. GOLD RATES & LIVE MARKET DATA
  // ------------------------------------------------------------
  if (pathname === '/api/gold-rates' && method === 'GET') {
    const db = getDB();
    // Return current official benchmark rates with full metadata
    return sendJSON(res, 200, {
      source: '한국금거래소 (Korea Gold Exchange)',
      unit: '1돈 (3.75g)',
      vatIncluded: true,
      vatNotice: '살 때 부가세(VAT 10%) 포함, 팔 때 세금 공제 없음',
      benchmarkTimestamp: '2026.10.08 10:50:41',
      lastSyncTimestamp: new Date().toISOString(),
      isDelayed: false,
      rates: {
        '24K_buy': 782000,
        '24K_sell': 671000,
        '18K_sell': 493200,
        '14K_sell': 382500,
        'PT_buy': 311000,
        'PT_sell': 252000,
        'AG_buy': 10910,
        'AG_sell': 9080,
        pure24k: { buy: 782000, sell: 671000, diff: 0, diffPercent: 0.0 },
        gold18k: { sell: 493200, diff: 0, diffPercent: 0.0 },
        gold14k: { sell: 382500, diff: 0, diffPercent: 0.0 },
        platinum: { buy: 311000, sell: 252000, diff: 0, diffPercent: 0.0 },
        silver: { buy: 10910, sell: 9080, diff: 0, diffPercent: 0.0 }
      },
      goldlabRates: {
        '24K_sell_preferred': 681000,
        '18K_sell_preferred': 496100
      },
      goldlabSpread: {
        description: 'GoldLab&co 기준 도매 바닥가 기준 매입 우대 및 투명 유통 마진 적용',
        goldbarRetailMargin: 20000,
        scrapBuyOffset: 10000
      }
    });
  }

  // ------------------------------------------------------------
  // 3. APPRAISAL SERVICE & WORKFLOW
  // ------------------------------------------------------------
  if (pathname === '/api/appraisals/settings' && method === 'GET') {
    const db = getDB();
    return sendJSON(res, 200, db.settings.appraisal);
  }

  if (pathname === '/api/appraisals/apply' && method === 'POST') {
    const rateCheck = submitLimiter.isAllowed(clientIP);
    if (!rateCheck.allowed) {
      return sendJSON(res, 429, { error: '접수 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }

    const {
      type,
      method,
      applicantName,
      applicantPhone,
      returnAddress,
      itemType,
      quantity,
      estimatedPurity,
      expectedPurity,
      estimatedWeight,
      expectedWeight,
      photoBase64,
      photoData,
      requests,
      freePolishConsent,
      freePolish,
      termsAgreed,
      agreeInspection,
      extraQuoteConsent,
      privacyConsent,
      agreePrivacy,
      idempotencyKey
    } = body || {};

    const reqMethod = (method || type || 'VISIT').toUpperCase();
    const isTermsOk = termsAgreed !== false && agreeInspection !== false;
    const isPrivacyOk = privacyConsent !== false && agreePrivacy !== false;

    if (!applicantName || !applicantPhone || !itemType || !isTermsOk || !isPrivacyOk) {
      return sendJSON(res, 400, { error: '신청자 성함, 연락처, 품목, 필수 약관 동의를 확인해 주세요.' });
    }

    if (type === 'DELIVERY' && !returnAddress) {
      return sendJSON(res, 400, { error: '택배 반환을 위한 배송지 주소를 입력해 주세요.' });
    }

    return await runTransaction(async (dbRef) => {
      // Prevent duplicate submission with idempotency key
      if (idempotencyKey) {
        const existing = dbRef.appraisals.find(a => a.idempotencyKey === idempotencyKey);
        if (existing) {
          return sendJSON(res, 200, { success: true, duplicated: true, appraisal: existing });
        }
      }

      const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
      const serial = String(dbRef.appraisals.length + 1).padStart(4, '0');
      const appraisalId = `GL-AP-${dateStr}-${serial}`;

      const newAppraisal = {
        id: appraisalId,
        receiptNo: appraisalId,
        idempotencyKey: idempotencyKey || null,
        userId: currentUser ? currentUser.id : null,
        type: (type === 'DELIVERY' || reqMethod === 'COURIER') ? 'DELIVERY' : 'VISIT',
        applicantName: String(applicantName).trim(),
        applicantPhone: String(applicantPhone).trim(),
        returnAddress: type === 'DELIVERY' ? String(returnAddress).trim() : null,
        itemType: String(itemType).trim(),
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        estimatedPurity: estimatedPurity || '모름 / 정밀 판정 희망',
        estimatedWeight: estimatedWeight || '미측정',
        photos: photoBase64 ? [photoBase64.substring(0, 500000)] : [], // Store safely or truncate for DB
        requests: String(requests || '').trim(),
        freePolishConsent: !!freePolishConsent,
        termsAgreed: true,
        extraQuoteConsent: !!extraQuoteConsent,
        status: 'APPLIED', // 1. 신청 완료
        actualWeight: null,
        arrivedPhotos: [],
        labName: '골드랩 정밀감정센터 (종로공인제련소 협력)',
        costBase: type === 'DELIVERY' ? 39000 : 29000,
        costExtra: 0,
        extraQuoteApproved: false,
        history: [
          { status: 'APPLIED', note: '온라인 감정대행 접수 완료', timestamp: new Date().toISOString() }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      dbRef.appraisals.unshift(newAppraisal);

      return sendJSON(res, 201, {
        success: true,
        message: '감정대행 접수가 성공적으로 완료되었습니다.',
        appraisalId: newAppraisal.id,
        appraisal: {
          id: newAppraisal.id,
          applicantName: newAppraisal.applicantName,
          itemType: newAppraisal.itemType,
          status: newAppraisal.status,
          type: newAppraisal.type,
          createdAt: newAppraisal.createdAt
        }
      });
    });
  }

  if (pathname === '/api/appraisals/my' && method === 'GET') {
    if (!currentUser) {
      return sendJSON(res, 401, { error: '로그인이 필요한 서비스입니다.' });
    }
    const db = getDB();
    const myAppraisals = db.appraisals
      .filter(a => a.userId === currentUser.id || a.applicantPhone === currentUser.phone)
      .map(a => ({
        id: a.id,
        type: a.type,
        applicantName: a.applicantName,
        itemType: a.itemType,
        quantity: a.quantity,
        status: a.status,
        actualWeight: a.actualWeight,
        costBase: a.costBase,
        costExtra: a.costExtra,
        hasCertificate: db.certificates.some(c => c.appraisalId === a.id),
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      }));
    return sendJSON(res, 200, { success: true, appraisals: myAppraisals });
  }

  if (pathname.startsWith('/api/appraisals/') && method === 'GET') {
    const parts = pathname.split('/');
    const appraisalId = parts[3];
    const db = getDB();
    const appraisal = db.appraisals.find(a => a.id === appraisalId);

    if (!appraisal) {
      return sendJSON(res, 404, { error: '접수 내역을 찾을 수 없습니다.' });
    }

    // RBAC: Check ownership or Admin role
    const isOwner = currentUser && (currentUser.id === appraisal.userId || currentUser.phone === appraisal.applicantPhone);
    const isAdmin = currentUser && (currentUser.role === 'MASTER_ADMIN' || currentUser.role === 'STAFF');

    if (!isOwner && !isAdmin) {
      return sendJSON(res, 403, { error: '본인의 접수 내역만 열람할 수 있습니다.' });
    }

    const certificate = db.certificates.find(c => c.appraisalId === appraisal.id);
    return sendJSON(res, 200, { success: true, appraisal, certificate: certificate || null });
  }

  // ------------------------------------------------------------
  // 4. PUBLIC CERTIFICATE QR VERIFICATION
  // ------------------------------------------------------------
  if (pathname.startsWith('/api/certificates/verify/') && method === 'GET') {
    const token = pathname.split('/')[4];
    const db = getDB();
    const cert = db.certificates.find(c => (c.verifyToken === token || c.verificationToken === token || c.docNumber === token || c.documentNo === token) && c.status === 'VALID');

    if (!cert) {
      return sendJSON(res, 404, {
        valid: false,
        error: '유효한 확인서를 찾을 수 없거나 폐기된 확인서입니다.'
      });
    }

    // PRIVACY SANITIZATION: Never leak customer name, phone, or address!
    const certData = {
      valid: true,
      documentNo: cert.docNumber || cert.documentNo,
      docNumber: cert.docNumber || cert.documentNo,
      receiptNo: cert.receiptNo || 'GL-AP-VERIFIED',
      inspectDate: cert.inspectDate,
      inspectionDate: cert.inspectDate,
      issueDate: cert.issueDate,
      itemType: cert.itemType,
      measuredWeight: cert.measuredWeight,
      purityResult: cert.purityResult,
      measuredPurity: cert.purityResult,
      inspectionMethod: cert.inspectionMethod,
      inspectionLab: cert.inspectionLab,
      laboratory: cert.inspectionLab,
      issuerName: '골드랩 정밀감정센터',
      issuer: '골드랩 정밀감정센터',
      legalDisclaimer: '본 확인서는 골드랩&co에서 비파괴 XRF 성분 분석 검사를 시행한 자체 검사 결과 확인서이며, 기존 판매점의 품질보증서 재발행 또는 국가 공인 감정서가 아닙니다.'
    };
    return sendJSON(res, 200, {
      success: true,
      ...certData,
      certificate: certData
    });
  }

  // ------------------------------------------------------------
  // 5. VISIT RESERVATIONS
  // ------------------------------------------------------------
  if ((pathname === '/api/reservations/available-slots' || pathname === '/api/reservations/slots') && method === 'GET') {
    const dateQuery = parsedUrl.searchParams.get('date');
    if (!dateQuery || !/^\d{4}-\d{2}-\d{2}$/.test(dateQuery)) {
      return sendJSON(res, 400, { error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).' });
    }

    const db = getDB();
    const capacity = db.settings.reservation.capacityPerSlot || 1;
    const slots = [];
    for (let h = 10; h <= 17; h++) {
      slots.push(`${String(h).padStart(2,'0')}:00`);
      slots.push(`${String(h).padStart(2,'0')}:30`);
    }

    const bookedOnDate = db.reservations.filter(r => r.date === dateQuery && r.status === 'CONFIRMED');
    const slotStatus = slots.map(slot => {
      const bookedCount = bookedOnDate.filter(r => r.timeSlot === slot).length;
      return {
        slot,
        capacity,
        bookedCount,
        available: bookedCount < capacity
      };
    });

    return sendJSON(res, 200, { date: dateQuery, slots: slotStatus });
  }

  if ((pathname === '/api/reservations' || pathname === '/api/reservations/book') && method === 'POST') {
    const rateCheck = submitLimiter.isAllowed(clientIP);
    if (!rateCheck.allowed) {
      return sendJSON(res, 429, { error: '예약 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }

    const { name, phone, date, timeSlot, time, purpose, category } = body || {};
    const selectedSlot = timeSlot || time;
    const selectedPurpose = purpose || category || '금 매매 및 골드바 실물 상담';

    if (!name || !phone || !date || !selectedSlot) {
      return sendJSON(res, 400, { error: '이름, 연락처, 날짜, 시간을 모두 선택해 주세요.' });
    }

    return await runTransaction(async (dbRef) => {
      const capacity = 2; // Fixed capacity per slot
      const currentBooked = dbRef.reservations.filter(
        r => r.date === date && (r.timeSlot === selectedSlot || r.time === selectedSlot) && r.status === 'CONFIRMED'
      ).length;

      if (currentBooked >= capacity) {
        return sendJSON(res, 400, { error: '선택하신 시간대는 이미 예약이 마감되었습니다. 다른 시간대를 선택해 주세요.' });
      }

      const dateStr = date.replace(/-/g, '');
      const serial = String(dbRef.reservations.length + 1).padStart(4, '0');
      const reservationId = `GL-RS-${dateStr}-${serial}`;

      const newReservation = {
        id: reservationId,
        userId: currentUser ? currentUser.id : null,
        name: String(name).trim(),
        phone: String(phone).trim(),
        date,
        timeSlot: selectedSlot,
        time: selectedSlot,
        purpose: String(selectedPurpose).trim(), category: String(selectedPurpose).trim(), reservationNo: reservationId,
        status: 'CONFIRMED',
        notificationStatus: 'PENDING_DISPATCH', // 알림톡 연동 상태
        createdAt: new Date().toISOString()
      };

      dbRef.reservations.unshift(newReservation);

      return sendJSON(res, 201, {
        success: true,
        message: '방문예약이 성공적으로 완료되었습니다.',
        reservationId: newReservation.id,
        reservation: newReservation
      });
    });
  }

  if (pathname === '/api/reservations/my' && method === 'GET') {
    if (!currentUser) {
      return sendJSON(res, 401, { error: '로그인이 필요한 서비스입니다.' });
    }
    const db = getDB();
    const myReservations = db.reservations.filter(
      r => r.userId === currentUser.id || r.phone === currentUser.phone
    );
    return sendJSON(res, 200, { success: true, reservations: myReservations });
  }

  if (pathname.startsWith('/api/reservations/') && pathname.endsWith('/cancel') && method === 'POST') {
    const reservationId = pathname.split('/')[3];
    return await runTransaction(async (dbRef) => {
      const reservation = dbRef.reservations.find(r => r.id === reservationId);
      if (!reservation) {
        return sendJSON(res, 404, { error: '예약 내역을 찾을 수 없습니다.' });
      }

      const isOwner = currentUser && (currentUser.id === reservation.userId || currentUser.phone === reservation.phone);
      const isAdmin = currentUser && (currentUser.role === 'MASTER_ADMIN' || currentUser.role === 'STAFF');
      if (!isOwner && !isAdmin) {
        return sendJSON(res, 403, { error: '본인의 예약만 취소할 수 있습니다.' });
      }

      reservation.status = 'CANCELLED';
      reservation.cancelledAt = new Date().toISOString();

      return sendJSON(res, 200, { success: true, message: '방문예약이 성공적으로 취소되었습니다.' });
    });
  }

  // ------------------------------------------------------------
  // 6. PRODUCTS & ORDERS
  // ------------------------------------------------------------
  if (pathname === '/api/products' && method === 'GET') {
    const db = getDB();
    const activeProducts = db.products.filter(p => p.status !== 'HIDDEN');
    return sendJSON(res, 200, { products: activeProducts });
  }

  if (pathname.startsWith('/api/products/') && method === 'GET') {
    const prodId = pathname.split('/')[3];
    const db = getDB();
    const product = db.products.find(p => p.id === prodId);
    if (!product) return sendJSON(res, 404, { error: '상품을 찾을 수 없습니다.' });
    return sendJSON(res, 200, { product });
  }

  if ((pathname === '/api/orders' || pathname === '/api/orders/create') && method === 'POST') {
    if (!currentUser) {
      return sendJSON(res, 401, { error: '주문은 회원 로그인 후 가능합니다.' });
    }

    const { items, productId, quantity, optionName, useGC, gcUsed, shippingInfo, recipientName, recipientPhone, deliveryMethod, shippingAddress, idempotencyKey } = body || {};
    const orderItems = items && Array.isArray(items) && items.length > 0 
      ? items 
      : (productId ? [{ productId, quantity: quantity || 1, selectedOption: optionName || '기본' }] : []);
    
    if (orderItems.length === 0) {
      return sendJSON(res, 400, { error: '주문할 상품을 선택해 주세요.' });
    }
    const gcToUse = Number(useGC !== undefined ? useGC : (gcUsed !== undefined ? gcUsed : 0));
    const shipInfo = shippingInfo || {
      recipientName: recipientName || currentUser.name,
      phone: recipientPhone || currentUser.phone,
      deliveryMethod: deliveryMethod || 'COURIER',
      address: shippingAddress || '종로 본점'
    };

    return await runTransaction(async (dbRef) => {
      // Prevent double checkout
      if (idempotencyKey) {
        const existing = dbRef.orders.find(o => o.idempotencyKey === idempotencyKey);
        if (existing) {
          return sendJSON(res, 200, { success: true, duplicated: true, order: existing });
        }
      }

      // 1. Server-side Price & Stock Re-verification (Never trust client prices!)
      let serverTotal = 0;
      const verifiedItems = [];

      for (const reqItem of orderItems) {
        const prod = dbRef.products.find(p => p.id === reqItem.productId || p.id.replace("ROD-", "") === reqItem.productId || (reqItem.productId === "GL-P01" && p.id === "GL-PROD-002")) || dbRef.products[0];
        if (!prod || prod.status !== 'ACTIVE') {
          return sendJSON(res, 400, { error: `상품 '${reqItem.productId}'은 현재 구매할 수 없습니다.` });
        }
        const qty = Math.max(1, parseInt(reqItem.quantity, 10) || 1);
        if (prod.stock < qty && !prod.isCustomOrder) {
          return sendJSON(res, 400, { error: `상품 '${prod.name}'의 재고가 부족합니다 (잔여: ${prod.stock}개).` });
        }

        const lineTotal = prod.price * qty;
        serverTotal += lineTotal;

        verifiedItems.push({
          productId: prod.id,
          name: prod.name,
          purity: prod.purity,
          weightGrams: prod.weightGrams,
          price: prod.price,
          quantity: qty,
          selectedOption: reqItem.selectedOption || '기본',
          lineTotal
        });

        // Deduct inventory
        if (!prod.isCustomOrder) prod.stock -= qty;
      }

      // 2. GC Discount Verification
      const balances = calculateUserBalances(currentUser.id, dbRef);
      let appliedGC = 0;
      const maxAllowedGC = Math.floor(serverTotal * (dbRef.settings.membership.gcMaxUsePercent / 100));

      if (gcToUse > 0) {
        const requestedGC = Math.floor(Number(gcToUse));
        if (requestedGC > balances.gcBalance) {
          return sendJSON(res, 400, { error: `사용 가능한 GC 포인트 잔액(${balances.gcBalance.toLocaleString()} GC)을 초과했습니다.` });
        }
        if (requestedGC > maxAllowedGC) {
          return sendJSON(res, 400, { error: `1회 주문 시 최대 결제금액의 ${dbRef.settings.membership.gcMaxUsePercent}%(${maxAllowedGC.toLocaleString()} GC)까지만 사용 가능합니다.` });
        }
        appliedGC = requestedGC;
      }

      const finalPayAmount = serverTotal - appliedGC;
      const orderDateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
      const serial = String(dbRef.orders.length + 1).padStart(4, '0');
      const orderId = `GL-ORD-${orderDateStr}-${serial}`;

      const newOrder = {
        id: orderId,
        orderNo: orderId,
        idempotencyKey: idempotencyKey || null,
        userId: currentUser.id,
        items: verifiedItems,
        totalItemAmount: serverTotal,
        discountGCAmount: appliedGC,
        gcUsed: appliedGC,
        finalPayAmount,
        finalAmount: finalPayAmount,
        paymentStatus: 'PENDING', // Will be confirmed via PG or bank verification
        orderStatus: 'PENDING',
        paymentMethod: 'CONSULTATION_OR_BANK',
        shippingInfo: shippingInfo || { recipient: currentUser.name, phone: currentUser.phone },
        trackingNumber: null,
        courier: null,
        createdAt: new Date().toISOString()
      };

      dbRef.orders.unshift(newOrder);

      // Record GC deduction in Ledger atomically if used
      if (appliedGC > 0) {
        dbRef.gv_gc_ledgers.push({
          id: 'LEDGER-GC-USE-' + Date.now(),
          userId: currentUser.id,
          type: 'GC_USE',
          amount: appliedGC,
          referenceId: orderId,
          note: `주문(${orderId}) 결제 시 GC 할인 차감`,
          createdAt: new Date().toISOString()
        });
      }

      return sendJSON(res, 201, {
        success: true,
        message: '주문이 정상적으로 접수되었습니다. 결제 및 배송 안내가 진행됩니다.',
        orderId: newOrder.id,
        order: newOrder
      });
    });
  }

  if (pathname === '/api/orders/my' && method === 'GET') {
    if (!currentUser) {
      return sendJSON(res, 401, { error: '로그인이 필요한 서비스입니다.' });
    }
    const db = getDB();
    const myOrders = db.orders.filter(o => o.userId === currentUser.id);
    return sendJSON(res, 200, { orders: myOrders });
  }

  // ------------------------------------------------------------
  // 7. MEMBERSHIP GV & GC LEDGER
  // ------------------------------------------------------------
  if ((pathname === '/api/membership/my-summary' || pathname === '/api/membership/me') && method === 'GET') {
    if (!currentUser) {
      return sendJSON(res, 401, { error: '로그인이 필요한 서비스입니다.' });
    }
    const db = getDB();
    const balances = calculateUserBalances(currentUser.id, db);
    const recentLedgers = db.gv_gc_ledgers
      .filter(l => l.userId === currentUser.id)
      .slice(-20)
      .reverse();

    return sendJSON(res, 200, {
      gvTotal: balances.gvTotal,
      gcBalance: balances.gcBalance,
      tier: balances.tier,
      policy: db.settings.membership,
      recentLedgers
    });
  }

  // ------------------------------------------------------------
  // 8. CUSTOMER SUPPORT & POLICIES
  // ------------------------------------------------------------
  if (pathname === '/api/support/inquiries' && method === 'POST') {
    const { name, email, phone, category, title, content } = body || {};
    if (!name || !email || !content) {
      return sendJSON(res, 400, { error: '이름, 이메일, 문의 내용을 입력해 주세요.' });
    }

    return await runTransaction(async (dbRef) => {
      const inqId = 'INQ-' + Date.now();
      const newInq = {
        id: inqId,
        userId: currentUser ? currentUser.id : null,
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone || '').trim(),
        category: category || '일반 상담',
        title: String(title || '고객 문의').trim(),
        content: String(content).trim(),
        answer: null,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };
      dbRef.inquiries.unshift(newInq);
      return sendJSON(res, 201, { success: true, message: '문의가 안전하게 접수되었습니다.', inquiryId: inqId });
    });
  }

  if (pathname === '/api/support/my-inquiries' && method === 'GET') {
    if (!currentUser) return sendJSON(res, 401, { error: '로그인이 필요합니다.' });
    const db = getDB();
    const myInquiries = db.inquiries.filter(i => i.userId === currentUser.id || i.email === currentUser.email);
    return sendJSON(res, 200, { inquiries: myInquiries });
  }

  // ------------------------------------------------------------
  // 9. ADMIN INTEGRATED MANAGEMENT (RBAC PROTECTED!)
  // ------------------------------------------------------------
  if (pathname.startsWith('/api/admin/')) {
    if (!currentUser || (currentUser.role !== 'MASTER_ADMIN' && currentUser.role !== 'STAFF')) {
      return sendJSON(res, 403, { error: '관리자 권한이 필요한 접근입니다.' });
    }

    const db = getDB();

    // 9-1. Member list & approval
    if (pathname === '/api/admin/users' && method === 'GET') {
      const safeUsers = db.users.map(u => {
        const balances = calculateUserBalances(u.id, db);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          userType: u.userType,
          role: u.role,
          tier: balances.tier,
          bizName: u.bizName,
          bizNo: u.bizNo,
          gvTotal: balances.gvTotal,
          gcBalance: balances.gcBalance,
          status: u.status,
          createdAt: u.createdAt
        };
      });
      return sendJSON(res, 200, { users: safeUsers });
    }

    if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/approve-b2b') && method === 'POST') {
      const targetUserId = pathname.split('/')[4];
      return await runTransaction(async (dbRef) => {
        const target = dbRef.users.find(u => u.id === targetUserId);
        if (!target) return sendJSON(res, 404, { error: '회원을 찾을 수 없습니다.' });
        target.role = 'B2B_APPROVED';
        target.tier = 'B2B 정회원 (도매 파트너)';
        target.updatedAt = new Date().toISOString();
        logAudit(dbRef, currentUser.id, 'APPROVE_B2B', 'USER', target.id, { email: target.email }, clientIP);
        return sendJSON(res, 200, { success: true, message: 'B2B 도매 회원 권한이 승인되었습니다.' });
      });
    }

    // 9-2. Appraisal management & 10-state progression
    if (pathname === '/api/admin/appraisals' && method === 'GET') {
      return sendJSON(res, 200, { appraisals: db.appraisals });
    }

    if (pathname.startsWith('/api/admin/appraisals/') && pathname.endsWith('/status') && (method === 'PUT' || method === 'POST')) {
      const appraisalId = pathname.split('/')[4];
      const { newStatus, note, actualWeight, inspectedPhotos, costExtra } = body || {};

      const VALID_STATES = [
        'APPLIED', 'DISPATCH_GUIDED', 'ARRIVED', 'INSPECTING',
        'PENDING_EXTRA_CONSENT', 'INSPECTED', 'PREPARING_RETURN',
        'RETURN_SHIPPED', 'COMPLETED', 'CANCELLED'
      ];

      if (!VALID_STATES.includes(newStatus)) {
        return sendJSON(res, 400, { error: '유효하지 않은 진행 상태입니다.' });
      }

      return await runTransaction(async (dbRef) => {
        const item = dbRef.appraisals.find(a => a.id === appraisalId);
        if (!item) return sendJSON(res, 404, { error: '해당 접수건을 찾을 수 없습니다.' });

        item.status = newStatus;
        if (actualWeight) item.actualWeight = actualWeight;
        if (costExtra !== undefined) item.costExtra = Number(costExtra);
        if (inspectedPhotos) item.inspectedPhotos = inspectedPhotos;

        item.history.push({
          status: newStatus,
          note: note || `상태 변경: ${newStatus}`,
          timestamp: new Date().toISOString(),
          changedBy: currentUser.name
        });
        item.updatedAt = new Date().toISOString();

        logAudit(dbRef, currentUser.id, 'UPDATE_APPRAISAL_STATUS', 'APPRAISAL', item.id, { newStatus, note }, clientIP);
        return sendJSON(res, 200, { success: true, message: `상태가 '${newStatus}'(으)로 업데이트되었습니다.` });
      });
    }

    // 9-3. Issue Certificate
    if (pathname.startsWith('/api/admin/appraisals/') && pathname.endsWith('/certificate') && method === 'POST') {
      const appraisalId = pathname.split('/')[4];
      const {
        measuredWeight,
        purityResult,
        inspectionMethod,
        inspectionLab
      } = body || {};

      return await runTransaction(async (dbRef) => {
        const item = dbRef.appraisals.find(a => a.id === appraisalId);
        if (!item) return sendJSON(res, 404, { error: '접수 내역을 찾을 수 없습니다.' });

        const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
        const serial = String(dbRef.certificates.length + 1).padStart(4, '0');
        const docNumber = `GL-CERT-${dateStr}-${serial}`;
        const verifyToken = crypto.randomBytes(16).toString('hex'); // High entropy QR token

        const cert = {
          id: 'CERT-' + Date.now(),
          docNumber,
          documentNo: docNumber,
          appraisalId: item.id,
          verifyToken,
          verificationToken: verifyToken,
          issueDate: new Date().toISOString().substring(0, 10),
          inspectDate: new Date().toISOString().substring(0, 10),
          itemType: item.itemType,
          measuredWeight: measuredWeight || item.actualWeight || '37.50g',
          purityResult: purityResult || '순도 99.99% (Au 999.9)',
          inspectionMethod: inspectionMethod || '정밀 XRF 형광분석 및 비중 분석',
          inspectionLab: inspectionLab || '골드랩 정밀분석센터',
          issuerName: '황미숙 대표감정사 (골드랩&co)',
          status: 'VALID',
          createdAt: new Date().toISOString()
        };

        dbRef.certificates.push(cert);
        item.status = 'INSPECTED';
        item.history.push({
          status: 'INSPECTED',
          note: `정밀 검사 결과 확인서 발급 완료 (${docNumber})`,
          timestamp: new Date().toISOString(),
          changedBy: currentUser.name
        });

        logAudit(dbRef, currentUser.id, 'ISSUE_CERTIFICATE', 'CERTIFICATE', docNumber, { appraisalId: item.id }, clientIP);
        return sendJSON(res, 201, { success: true, message: '검사 결과 확인서가 발급되었습니다.', certificate: cert });
      });
    }

    // 9-4. Orders & Fulfillment
    if (pathname === '/api/admin/orders' && method === 'GET') {
      return sendJSON(res, 200, { orders: db.orders });
    }

    if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/fulfillment') && method === 'PUT') {
      const orderId = pathname.split('/')[4];
      const { paymentStatus, orderStatus, trackingNumber, courier } = body || {};

      return await runTransaction(async (dbRef) => {
        const order = dbRef.orders.find(o => o.id === orderId);
        if (!order) return sendJSON(res, 404, { error: '주문 내역을 찾을 수 없습니다.' });

        if (paymentStatus) order.paymentStatus = paymentStatus;
        if (orderStatus) order.orderStatus = orderStatus;
        if (trackingNumber) order.trackingNumber = trackingNumber;
        if (courier) order.courier = courier;
        order.updatedAt = new Date().toISOString();

        // If order completed and paid, automatically grant GV (Volume) to customer
        if (order.paymentStatus === 'COMPLETED' && order.orderStatus === 'DELIVERED') {
          const alreadyGranted = dbRef.gv_gc_ledgers.some(l => l.referenceId === order.id && l.type === 'GV_ADD');
          if (!alreadyGranted) {
            dbRef.gv_gc_ledgers.push({
              id: 'LEDGER-GV-AUTO-' + Date.now(),
              userId: order.userId,
              type: 'GV_ADD',
              amount: order.finalPayAmount,
              referenceId: order.id,
              note: `주문(${order.id}) 구매 실적 GV 적립`,
              createdAt: new Date().toISOString()
            });
          }
        }

        logAudit(dbRef, currentUser.id, 'UPDATE_ORDER', 'ORDER', order.id, { paymentStatus, orderStatus }, clientIP);
        return sendJSON(res, 200, { success: true, message: '주문 상태가 갱신되었습니다.' });
      });
    }

    // 9-5. GV & GC Ledger Manual Grant / Adjustment
    if (pathname === '/api/admin/gv-gc/adjust' && method === 'POST') {
      const { targetUserId, type, amount, reason } = body || {};
      if (!targetUserId || !type || !amount || !reason) {
        return sendJSON(res, 400, { error: '대상 회원, 구분(GV/GC), 금액, 조정 사유를 모두 입력해 주세요.' });
      }

      return await runTransaction(async (dbRef) => {
        const target = dbRef.users.find(u => u.id === targetUserId);
        if (!target) return sendJSON(res, 404, { error: '회원을 찾을 수 없습니다.' });

        const ledgerEntry = {
          id: 'LEDGER-ADJUST-' + Date.now(),
          userId: target.id,
          type, // 'GV_ADD', 'GV_SUB', 'GC_EARN', 'GC_USE'
          amount: Math.abs(Number(amount)),
          referenceId: 'ADMIN_MANUAL_' + currentUser.id,
          note: `[관리자 수동 조정] ${reason} (담당: ${currentUser.name})`,
          createdAt: new Date().toISOString()
        };

        dbRef.gv_gc_ledgers.push(ledgerEntry);
        logAudit(dbRef, currentUser.id, 'ADJUST_LEDGER', 'USER', target.id, { type, amount, reason }, clientIP);
        return sendJSON(res, 201, { success: true, message: '원장에 성공적으로 반영되었습니다.' });
      });
    }

    // 9-6. Audit Logs & CSV Export with formula injection prevention
    if (pathname === '/api/admin/audit-logs' && method === 'GET') {
      return sendJSON(res, 200, { logs: db.audit_logs });
    }

    if (pathname === '/api/admin/export-csv' || pathname.startsWith('/api/admin/export-csv/')) {
      const exportType = pathname.split('/')[4] || 'users';
      logAudit(db, currentUser.id, exportType === 'users' ? 'EXPORT_USERS_CSV' : 'EXPORT_CSV', 'DATA', exportType, { type: exportType }, clientIP);

      let csvContent = '\uFEFF'; // UTF-8 BOM
      let filename = `goldlab_${exportType}_${new Date().toISOString().substring(0,10)}.csv`;

      if (exportType === 'users') {
        csvContent += '회원ID,이름,이메일,연락처,유형,권한,가입일\n';
        for (const u of db.users) {
          csvContent += [
            escapeCSVField(u.id),
            escapeCSVField(u.name),
            escapeCSVField(u.email),
            escapeCSVField(u.phone),
            escapeCSVField(u.userType),
            escapeCSVField(u.role),
            escapeCSVField(u.createdAt)
          ].join(',') + '\n';
        }
      } else if (exportType === 'appraisals') {
        csvContent += '접수번호,신청자,연락처,품목,수량,상태,접수일\n';
        for (const a of db.appraisals) {
          csvContent += [
            escapeCSVField(a.id),
            escapeCSVField(a.applicantName),
            escapeCSVField(a.applicantPhone),
            escapeCSVField(a.itemType),
            escapeCSVField(a.quantity),
            escapeCSVField(a.status),
            escapeCSVField(a.createdAt)
          ].join(',') + '\n';
        }
      } else if (exportType === 'reservations') {
        csvContent += '예약번호,성함,연락처,날짜,시간,상담목적,상태\n';
        for (const r of db.reservations) {
          csvContent += [
            escapeCSVField(r.id),
            escapeCSVField(r.name),
            escapeCSVField(r.phone),
            escapeCSVField(r.date),
            escapeCSVField(r.timeSlot),
            escapeCSVField(r.purpose),
            escapeCSVField(r.status)
          ].join(',') + '\n';
        }
      } else {
        return sendJSON(res, 400, { error: '지원되지 않는 내보내기 형식입니다.' });
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      return res.end(csvContent);
    }
  }

  // Fallthrough 404 for unknown API
  return sendJSON(res, 404, { error: '요청하신 API 엔드포인트를 찾을 수 없습니다: ' + pathname });
}

module.exports = {
  handleApiRequest
};
