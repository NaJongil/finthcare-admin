// 라이브러리 없이 node crypto만으로 만든 세션 토큰.
// payload를 base64url로 담고 HMAC-SHA256 서명을 붙인다.
import crypto from 'crypto';

const TTL_MS = 12 * 60 * 60 * 1000; // 12시간

function secret() {
    const s = process.env.SESSION_SECRET;
    if (!s) throw new Error('SESSION_SECRET not configured');
    return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(body) {
    return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

export function issueToken(orgId) {
    const body = b64url(JSON.stringify({ orgId, exp: Date.now() + TTL_MS }));
    return `${body}.${sign(body)}`;
}

/** 유효하면 payload, 아니면 null. 서명 비교는 상수 시간으로 한다. */
export function verifyToken(token) {
    if (typeof token !== 'string') return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;

    const expected = sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch {
        return null;
    }
    if (!payload || typeof payload.orgId !== 'string') return null;
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload;
}

/** Authorization: Bearer <token> 에서 payload 추출. */
export function authenticate(req) {
    const header = req.headers.authorization || '';
    const match = /^Bearer (.+)$/.exec(header);
    return match ? verifyToken(match[1]) : null;
}
