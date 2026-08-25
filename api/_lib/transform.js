// 상태 매핑·익명화·집계. 이 파일을 거친 값만 클라이언트로 나간다.

const EXCLUDED = new Set(['취소', '테스트/기타']);

/** RequestSpecialist 상태 표시값. 제외 대상은 null. */
export function mapSpecialistStatus(status) {
    if (EXCLUDED.has(status)) return null;
    if (status === '접수' || status === '진행중' || status === '홀드') return '진행 중';
    if (status === '예약완료' || status === '진료완료') return '추천 예약 제공';
    if (status === '비예약 완료') return '상담 제공';
    return null;
}

/** RequestCheckup 상태 표시값. 제외 대상은 null. */
export function mapCheckupStatus(status) {
    if (EXCLUDED.has(status)) return null;
    if (status === '예약완료' || status === '검진완료') return '할인 예약 제공';
    if (status === '홀드' || status === '접수' || status === '진행중') return '진행 중';
    return null;
}

/** 김글라라 → 김***. 한 글자면 김*. */
export function maskName(name) {
    const n = (name || '').trim();
    if (!n) return '–';
    return n.length > 1 ? n[0] + '*'.repeat(n.length - 1) : n + '*';
}

const TITLES = '(교수님|교수|원장님|원장|센터장|과장|전문의|조교수|부교수|선생님|선생|의사|박사)';

/**
 * 추천 사유 본문 속 의료진명 마스킹.
 * 1) 레코드에 등록된 의료진명을 직접 치환하고
 * 2) '한글 2~4자 + 직함' 패턴을 추가로 훑는다.
 */
export function maskDoctorsInText(text, knownNames) {
    if (!text) return text;
    let out = text;

    for (const name of knownNames || []) {
        if (name && name.length >= 2) {
            out = out.split(name).join(name[0] + '*'.repeat(name.length - 1));
        }
    }

    return out.replace(
        new RegExp('([가-힣]{2,4})\\s*' + TITLES, 'g'),
        (_, n, t) => n[0] + '*'.repeat(n.length - 1) + ' ' + t
    );
}

/** YY/MM/DD. */
export function formatDate(value) {
    if (!value) return '–';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getFullYear() % 100)}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

function truncate(text, max) {
    if (!text) return '';
    const t = text.trim().replace(/\s*\n\s*/g, ' ');
    return t.length > max ? t.slice(0, max) + '…' : t;
}

/** 명의예약 행. 질환 정보가 함께 나가므로 사람 이름은 전부 마스킹한다. */
function specialistRow(f) {
    const known = [f.Specialist1, f.Specialist2, f.Specialist3].filter(Boolean);
    const wait = f.WaitingTime;

    return {
        submitted: formatDate(f.SubmittedAt),
        user: maskName(f.RelatedMember),
        patient: maskName(f.PatientName),
        relation: f.MemberPatientRelation || '–',
        disease: f.DiseaseCategory1 || f.DiseaseName || '–',
        status: mapSpecialistStatus(f.Status),
        hospital: f.Hospital1 || '–',
        department: f.Department1 || '–',
        specialist: maskName(f.Specialist1),
        waiting: typeof wait === 'number' && wait > 0 ? `${Math.round(wait)}일` : '–',
        appointment: formatDate(f.Appointment1),
        reason: maskDoctorsInText(truncate(f.RecommendReason1, 300), known),
    };
}

/**
 * 건강검진 행. 담당자가 임직원 대상자를 관리·정산해야 하므로 실명을 남긴다.
 * 이 논리가 성립하지 않는 판매조직 계열은 /api/auth에서 로그인 자체를 막는다.
 */
function checkupRow(f) {
    const center = [f.Hospital, f.HospitalBranch].filter(Boolean).join(' ');

    return {
        submitted: formatDate(f.SubmittedAt),
        user: f.RelatedMember || '–',
        patient: f.PatientName || '–',
        relation: f.MemberPatientRelation || '–',
        center: center || '–',
        program: f.Program || '–',
        checkupDate: formatDate(f.CheckupDate),
        status: mapCheckupStatus(f.Status),
        amount: typeof f.TotalPrice === 'number' ? f.TotalPrice : null,
    };
}

/**
 * 조회된 원본 레코드를 대시보드 응답으로 가공한다.
 * 레코드는 이 조직의 OrgList 링크에서 나온 ID로만 조회했으므로 소속이 이미 확정이다.
 */
export function buildReport(orgName, specialistRecords, checkupRecords) {
    const keep = (row) => row.status !== null;
    const specialist = specialistRecords.map((r) => specialistRow(r.fields)).filter(keep);
    const checkup = checkupRecords.map((r) => checkupRow(r.fields)).filter(keep);
    const all = [...specialist, ...checkup];

    // 표시용 YY/MM/DD는 사전순 정렬이 곧 시간순이다.
    const bySubmittedDesc = (a, b) => b.submitted.localeCompare(a.submitted);

    return {
        orgName,
        summary: {
            total: all.length,
            specialistTotal: specialist.length,
            checkupTotal: checkup.length,
            statusCounts: all.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}),
        },
        specialist: specialist.sort(bySubmittedDesc),
        checkup: checkup.sort(bySubmittedDesc),
    };
}
