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

// 존칭 없이 쓰이는 직함. '님/씨'가 붙는 경우는 아래 HONORIFIC이 통째로 잡는다.
const TITLES =
    '(교수|원장|센터장|지점장|본부장|실장|팀장|부장|차장|과장|대리|주임|매니저|' +
    '컨설턴트|상담사|코디네이터|코디|설계사|플래너|전문의|선생|간호사|담당자)';

// 성씨 + 1~3자. 이름처럼 생긴 토큰만 마스킹해 '있는 교수님' 같은 오탐을 막는다.
const SURNAME = '[김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구나민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제탁국어은편용]';
const NAME = SURNAME + '[가-힣]{1,3}';

// 직함을 열거하는 대신 존칭을 앵커로 삼는다. '지점장님'처럼 목록에 없는 직함도 함께 잡힌다.
const HONORIFIC = '[가-힣]{0,5}(?:님|씨)';

/** 실명·회사명·지점명을 지운다. 지우지 못한 흔적은 flagRisk가 잡는다. */
export function mask(text, extras) {
    let out = text;

    for (const term of extras.filter(Boolean)) {
        if (term.length >= 2) out = out.split(term).join('○○');
    }

    // 이름만 지우고 직함은 남긴다 ('이세연 매니저님' -> '○○ 매니저님').
    // 직함을 통째로 지우면 문장이 어색해지고 이름 없는 '담당자분께서'까지 건드리게 된다.
    // 이름 자리에 직함이 들어온 경우('지점장님')는 지울 이름이 없으므로 그대로 둔다.
    const isTitle = new RegExp('^' + TITLES + '$');
    const maskName = (whole, name, rest) => (isTitle.test(name) ? whole : '○○ ' + rest);

    out = out.replace(new RegExp('(?<![가-힣])(' + NAME + ')\\s*(' + HONORIFIC + ')', 'g'), maskName);
    out = out.replace(new RegExp('(?<![가-힣])(' + NAME + ')\\s*(' + TITLES + ')', 'g'), maskName);

    out = out.replace(/[가-힣]{2,6}(병원|의원|센터|지점)/g, '○○$1');

    return out.replace(/\s{2,}/g, ' ').trim();
}

const ROLE_NEARBY = new RegExp('(?:' + TITLES + '|님|씨)');

/**
 * 마스킹이 놓친 실명을 잡는다. 자동으로 지우면 멀쩡한 단어까지 조용히 사라지므로
 * 플래그만 세우고 판단은 사람에게 넘긴다.
 *
 * 원문에서 '이름처럼 생겼고 뒤 15자 안에 직함·존칭이 오는' 토큰을 후보로 뽑고,
 * 그 토큰이 마스킹 후에도 남아 있으면 의심으로 본다.
 */
export function flagRisk(original, masked) {
    const finder = new RegExp('(?<![가-힣])(' + NAME + ')([\\s\\S]{0,15})', 'g');

    for (const [, candidate, tail] of original.matchAll(finder)) {
        if (ROLE_NEARBY.test(tail) && masked.includes(candidate)) return '실명 의심';
    }
    if (new RegExp('(?<![가-힣])' + NAME + '\\s*(?=○○)').test(masked)) return '실명 의심';
    return null;
}

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
        };
        // 원문은 draft에 남기지 않는다 — draft는 git으로 추적되므로
        // 실명이 든 원본이 이력에 박힌다. 대조가 필요하면 Airtable에서 recordId로 연다.
        const risk = flagRisk(body, masked);
        if (risk) entry.warn = risk;

        added.push(entry);
    }

    fs.writeFileSync(DRAFT, JSON.stringify([...draft, ...added], null, 2) + '\n');

    const warned = added.filter((a) => a.warn).length;
    console.log(`신규 후보 ${added.length}건을 ${path.basename(DRAFT)}에 추가했습니다.`);
    if (warned) console.log(`  실명 의심 ${warned}건 — draft에서 warn 필드를 확인하세요.`);
    console.log('다음: draft를 열어 게재할 항목만 publish:true로 바꾸고 headline/body를 다듬으세요.');
}

// 직접 실행할 때만 fetch한다. mask/suspicious는 다른 스크립트에서도 재사용한다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}
