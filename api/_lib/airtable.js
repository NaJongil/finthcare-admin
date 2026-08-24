// Airtable 접근 계층. 클라이언트가 만든 formula는 절대 여기까지 오지 않는다.
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appTUSvRn9GseZXVk';

export const TABLES = {
    orgList: 'tblkdRKmvjRjvAfzz',
    specialist: 'tbluvWoEC5PkPjgAp',
    checkup: 'tbl8FqfXZIRnMi13s',
};

/** Airtable formula 문자열 리터럴 이스케이프. */
export function quote(value) {
    return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/**
 * 한 테이블을 offset 페이지네이션으로 전량 조회한다.
 * formula는 호출부(서버)에서만 조립한다.
 */
export async function fetchAll(tableId, formula, fields) {
    const apiKey = process.env.AIRTABLE_API_KEY;
    if (!apiKey) throw new Error('AIRTABLE_API_KEY not configured');

    const records = [];
    let offset;

    do {
        const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
        url.searchParams.set('pageSize', '100');
        if (formula) url.searchParams.set('filterByFormula', formula);
        if (offset) url.searchParams.set('offset', offset);
        for (const f of fields || []) url.searchParams.append('fields[]', f);

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
            throw new Error(`Airtable ${res.status}: ${await res.text()}`);
        }
        const data = await res.json();
        records.push(...data.records);
        offset = data.offset;
    } while (offset);

    return records;
}
