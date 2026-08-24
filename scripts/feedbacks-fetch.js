#!/usr/bin/env node
// 1단계: FeedbackService에서 신규 후보를 뽑아 마스킹 후 draft에 append.
// 모든 항목은 publish:false로 생성된다. 사람이 열어보고 고르는 것이 2단계.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DRAFT = path.join(DIR, 'feedbacks.draft.json');
const INDEX = path.join(DIR, '.feedbacks-index.json');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appTUSvRn9GseZXVk';
const TABLE = 'tblbv3Z9gxzc9WTe2';

const MIN_NPS = 9;
const MIN_BODY = 20;

const TITLES = '(님|씨|교수님|교수|원장님|원장|센터장|과장|전문의|선생님|선생)';

const readJson = (file, fallback) =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;

async function fetchFeedbacks() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    if (!apiKey) throw new Error('AIRTABLE_API_KEY 환경변수가 필요합니다.');

    const records = [];
    let offset;
    do {
        const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE}`);
        url.searchParams.set('pageSize', '100');
        url.searchParams.set('filterByFormula', `AND({NPS} >= ${MIN_NPS}, {Testimonial} != '')`);
        if (offset) url.searchParams.set('offset', offset);

        const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
        const data = await res.json();
        records.push(...data.records);
        offset = data.offset;
    } while (offset);

    return records;
}

/** 실명·회사명·지점명을 지운다. 지우지 못한 흔적은 warn으로 남긴다. */
function mask(text, extras) {
    let out = text;

    for (const term of extras.filter(Boolean)) {
        if (term.length >= 2) out = out.split(term).join('○○');
    }
    out = out.replace(new RegExp('[가-힣]{2,4}\\s*' + TITLES, 'g'), '○○ 담당자');
    out = out.replace(/[가-힣]{2,6}(병원|의원|센터|지점)/g, '○○$1');

    return out.trim();
}

const suspicious = (text) => new RegExp('[가-힣]{2,4}\\s*' + TITLES).test(text);

async function main() {
    const seen = new Set(readJson(INDEX, []));
    const draft = readJson(DRAFT, []);
    const known = new Set(draft.map((d) => d.recordId));

    const records = await fetchFeedbacks();
    const added = [];

    for (const r of records) {
        const f = r.fields;
        const body = (f.Testimonial || '').trim();
        if (body.length < MIN_BODY) continue;
        if (seen.has(r.id) || known.has(r.id)) continue;

        const extras = [
            f.Requester,
            f.PatientName,
            ...(f['OrgName (from RequestSpecialist)'] || []),
            ...(f['Hospital1 (from RequestSpecialist)'] || []),
            ...(f['Specialist1 (from RequestSpecialist)'] || []),
        ];
        const masked = mask(body, extras);

        const entry = {
            recordId: r.id,
            publish: false,
            headline: '',
            body: masked,
            userType: f.Service || '',
            addedAt: new Date().toISOString().slice(0, 10),
            _original: body,
        };
        if (suspicious(masked)) entry.warn = '실명 의심';

        added.push(entry);
    }

    fs.writeFileSync(DRAFT, JSON.stringify([...draft, ...added], null, 2) + '\n');

    const warned = added.filter((a) => a.warn).length;
    console.log(`신규 후보 ${added.length}건을 ${path.basename(DRAFT)}에 추가했습니다.`);
    if (warned) console.log(`  실명 의심 ${warned}건 — draft에서 warn 필드를 확인하세요.`);
    console.log('다음: draft를 열어 게재할 항목만 publish:true로 바꾸고 headline/body를 다듬으세요.');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
