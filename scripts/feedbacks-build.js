#!/usr/bin/env node
// 3단계: draft에서 publish:true인 항목만 공개 파일로 굽는다.
// Airtable 레코드 ID는 공개 파일에 넣지 않는다 — id는 fb-001 슬러그.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const DRAFT = path.join(DIR, 'feedbacks.draft.json');
const INDEX = path.join(DIR, '.feedbacks-index.json');
const OUT = path.join(ROOT, 'feedbacks.json');

const MAX_CARDS = 30;

const readJson = (file, fallback) =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;

function main() {
    const draft = readJson(DRAFT, []);
    const published = draft.filter((d) => d.publish);

    const missing = published.filter((d) => !d.headline?.trim() || !d.body?.trim());
    if (missing.length) {
        console.error(`headline 또는 body가 비어 있는 항목 ${missing.length}건이 있습니다.`);
        console.error('draft에서 채운 뒤 다시 실행하세요.');
        process.exit(1);
    }

    const cards = published
        .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)))
        .slice(0, MAX_CARDS)
        .map((d, i) => ({
            id: `fb-${String(i + 1).padStart(3, '0')}`,
            headline: d.headline.trim(),
            body: d.body.trim(),
            userType: (d.userType || '').trim(),
            addedAt: d.addedAt,
        }));

    fs.writeFileSync(OUT, JSON.stringify(cards, null, 2) + '\n');

    // 처리한 레코드는 index에 기록해 다음 fetch에서 다시 뜨지 않게 한다.
    const seen = new Set(readJson(INDEX, []));
    for (const d of draft) if (d.recordId) seen.add(d.recordId);
    fs.writeFileSync(INDEX, JSON.stringify([...seen], null, 2) + '\n');

    console.log(`feedbacks.json에 ${cards.length}건을 기록했습니다.`);
    if (published.length > MAX_CARDS) {
        console.log(`  최신 ${MAX_CARDS}건만 유지되고 ${published.length - MAX_CARDS}건은 제외됐습니다.`);
    }
}

main();
