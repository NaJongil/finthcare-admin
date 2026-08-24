// POST /api/auth  { accessCode } -> { token, orgName }
import { TABLES, fetchAll, quote } from './_lib/airtable.js';
import { issueToken } from './_lib/token.js';

// AccessCode는 RIGHT(RECORD_ID(), 8) 수식이라 항상 영숫자다.
// 형식을 좁게 검증해 formula injection 자체를 성립하지 않게 만든다.
const ACCESS_CODE = /^[A-Za-z0-9]{4,32}$/;

// IP당 분당 10회. 서버리스 인스턴스 단위 카운터라 완벽하진 않지만
// 단일 IP 브루트포스는 실질적으로 막는다.
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

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
            ['OrgName', 'BranchName']
        );

        if (records.length !== 1) {
            return res.status(401).json({ error: '접속 코드가 올바르지 않습니다.' });
        }

        const orgName = records[0].fields.OrgName;
        if (!orgName) {
            return res.status(401).json({ error: '접속 코드가 올바르지 않습니다.' });
        }

        // AccessCode, record.id는 응답에 담지 않는다.
        return res.status(200).json({
            token: issueToken(orgName),
            orgName,
            branchName: records[0].fields.BranchName || null,
        });
    } catch (err) {
        console.error('auth failed:', err.message);
        return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    }
}
