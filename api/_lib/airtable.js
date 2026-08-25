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

/**
 * 레코드 ID로 단건 조회.
 *
 * Airtable의 단건 조회 엔드포인트(GET .../{recordId})는 fields[] 파라미터를
 * 받지 않아 422 INVALID_REQUEST_UNKNOWN을 낸다. 목록 엔드포인트에
 * RECORD_ID() 필터를 걸어 필드 선택을 유지한다.
 */
export async function fetchRecord(tableId, recordId, fields) {
    const [record] = await fetchAll(tableId, `RECORD_ID()=${quote(recordId)}`, fields);
    return record || null;
}

/**
 * 레코드 ID 목록으로 조회한다. formula 길이 제한이 있어 50개씩 끊는다.
 * 기업명이 아니라 ID로 좁히므로 같은 기업명의 다른 지점이 섞이지 않는다.
 */
export async function fetchByIds(tableId, ids, fields) {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

    const pages = await Promise.all(
        chunks.map((chunk) =>
            fetchAll(tableId, `OR(${chunk.map((id) => `RECORD_ID()=${quote(id)}`).join(',')})`, fields)
        )
    );
    return pages.flat();
}
