// POST /api/auth  { accessCode } -> { token }
import { TABLES, fetchAll, quote } from './_lib/airtable.js';
import { issueToken } from './_lib/token.js';
import { configError } from './_lib/config.js';

// AccessCode는 RIGHT(RECORD_ID(), 8) 수식이라 항상 영숫자다.
// 형식을 좁게 검증해 formula injection 자체를 성립하지 않게 만든다.
const ACCESS_CODE = /^[A-Za-z0-9]{4,32}$/;

// IP당 분당 10회. 서버리스 인스턴스 단위 카운터라 완벽하진 않지만
// 단일 IP 브루트포스는 실질적으로 막는다.
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

// 이 대시보드는 임직원 복리후생 관점의 조직만 대상으로 한다.
// 판매조직 계열은 수검자가 담당자의 고객일 수 있어 같은 화면을 그대로 쓸 수 없다.
// (별도 view가 준비되면 그쪽으로 분기한다.)
const BLOCKED_CATEGORIES = new Set(['보험판매조직', '영업중심조직', '다단계판매조직', '테스트/기타']);

function rateLimited(ip) {
    const now = Date.now();
    const hits = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    hits.push(now);
    attempts.set(ip, hits);

    if (attempts.size > 5000) {
        for (const [key, times] of attempts) {
            if (!times.some((t) => now - t < WINDOW_MS)) attempts.delete(key);
        }
    }
    return hits.length > MAX_ATTEMPTS;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (configError(res)) return;

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (rateLimited(ip)) {
        return res.status(429).json({ error: '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }

    const accessCode = String(req.body?.accessCode || '').trim();
    if (!ACCESS_CODE.test(accessCode)) {
        return res.status(401).json({ error: '접속 코드가 올바르지 않습니다.' });
    }

    try {
        const records = await fetchAll(
            TABLES.orgList,
            `{AccessCode} = ${quote(accessCode)}`,
            ['OrgName', 'OrgCategory']
        );

        if (records.length !== 1) {
            return res.status(401).json({ error: '접속 코드가 올바르지 않습니다.' });
        }

        const org = records[0];
        if (!org.fields.OrgName) {
            return res.status(401).json({ error: '접속 코드가 올바르지 않습니다.' });
        }

        if (BLOCKED_CATEGORIES.has(org.fields.OrgCategory)) {
            return res.status(403).json({
                error: '이 조직은 아직 대시보드 대상이 아닙니다. 담당 매니저에게 문의해주세요.',
            });
        }

        // 같은 기업명이 여러 레코드로 나뉠 수 있어 기업명은 식별자가 되지 못한다.
        // 토큰에는 OrgList 레코드 ID를 담는다.
        return res.status(200).json({ token: issueToken(org.id) });
    } catch (err) {
        console.error('auth failed:', err.message);
        return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    }
}
