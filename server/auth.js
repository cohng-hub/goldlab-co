// server/auth.js - Enterprise-grade Authentication & RBAC Engine
const crypto = require('crypto');

// 1. Password Security with Scrypt (Zero-dependency, memory-hard)
function hashPassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('비밀번호는 최소 8자 이상이어야 합니다.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!password || !storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

// 2. Cryptographic Token Generator
function generateSecureToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// 3. Sliding Window Rate Limiter (Protects login, reset, and application APIs)
class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.records = new Map(); // key -> [timestamps]

    // Periodic garbage collection every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.records.entries()) {
        const valid = timestamps.filter(t => now - t < this.windowMs);
        if (valid.length === 0) {
          this.records.delete(key);
        } else {
          this.records.set(key, valid);
        }
      }
    }, 300000).unref();
  }

  isAllowed(key) {
    const now = Date.now();
    let timestamps = this.records.get(key) || [];
    timestamps = timestamps.filter(t => now - t < this.windowMs);

    if (timestamps.length >= this.maxRequests) {
      return { allowed: false, retryAfterMs: this.windowMs - (now - timestamps[0]) };
    }

    timestamps.push(now);
    this.records.set(key, timestamps);
    return { allowed: true, remaining: this.maxRequests - timestamps.length };
  }
}

// 4. Time-based One-Time Password (TOTP) RFC 6238 implementation (Native Node.js crypto)
function generateTOTP(secretBase32, timeStep = 30) {
  // Simple Base32 decode
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secretBase32.length; i++) {
    const val = base32chars.indexOf(secretBase32.charAt(i).toUpperCase());
    if (val >= 0) bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  const key = Buffer.from(bytes);

  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, '0');
}

function verifyTOTP(token, secretBase32, windowSteps = 1) {
  if (!token || !secretBase32) return false;
  const nowStep = Math.floor(Date.now() / 1000 / 30);
  for (let stepOffset = -windowSteps; stepOffset <= windowSteps; stepOffset++) {
    const testStepTime = (nowStep + stepOffset) * 30 * 1000;
    // Test code at this step
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (let i = 0; i < secretBase32.length; i++) {
      const val = base32chars.indexOf(secretBase32.charAt(i).toUpperCase());
      if (val >= 0) bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    const key = Buffer.from(bytes);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(nowStep + stepOffset));
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
    if (code === token.trim()) return true;
  }
  return false;
}

// 5. PII & Log Sanitizer (Masks phone numbers, emails, passwords in server logs)
function maskPII(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    // Mask email
    let sanitized = data.replace(/([a-zA-Z0-9_\.-]{2})([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9_\.-]+)/g, '$1***@$3');
    // Mask phone 010-XXXX-XXXX
    sanitized = sanitized.replace(/(01[016789]-?)(\d{3,4})(-?\d{4})/g, '$1****-$3');
    return sanitized;
  }
  if (typeof data === 'object') {
    const clone = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      if (['password', 'pass', 'token', 'secret', 'twoFactorSecret'].includes(k)) {
        clone[k] = '[REDACTED]';
      } else {
        clone[k] = maskPII(v);
      }
    }
    return clone;
  }
  return data;
}

// 6. CSV Formula Injection Escaper (Prevents Excel CSV formula injection = + - @)
function escapeCSVField(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val).replace(/"/g, '""');
  // If first character is formula trigger, prefix with single quote
  if (/^[=\+\-\@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str}"`;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  RateLimiter,
  generateTOTP,
  verifyTOTP,
  maskPII,
  escapeCSVField
};
