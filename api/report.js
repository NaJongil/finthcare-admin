// GET /api/report?month=2026-07|all   Authorization: Bearer <token>
import { TABLES, fetchRecord, fetchByIds } from './_lib/airtable.js';
import { authenticate } from './_lib/token.js';
import { buildReport } from './_lib/transform.js';

const MONTH = /^\d{4}-\d{2}$/;

const SPECIALIST_FIELDS = [
    'SubmittedAt', 'RelatedMember', 'PatientName', 'MemberPatientRelation',
    'DiseaseCategory1', 'DiseaseName', 'Status', 'Hospital1', 'Department1',
    'Specialist1', 'Specialist2', 'Specialist3', 'WaitingTime', 'Appointment1',
    'RecommendReason1', '월별',
];

const CHECKUP_FIELDS = [
    'SubmittedAt', 'RelatedMember', 'PatientName', 'MemberPatientRelation',
    'Hospital', 'HospitalBranch', 'Program', 'CheckupDate', 'Status',
    'TotalPrice', '월별',
];

const ORG_FIELDS = ['OrgName', 'BranchName', 'OrgCategory', 'RequestSpecialist', 'RequestCheckup'];

// GA는 수검자가 설계사의 고객일 수 있어 검진 이름도 마스킹한다.
// 일반기업은 담당자의 대상자 관리·정산을 위해 실명을 남긴다.
const MASK_CHECKUP_NAMES = new Set(['보험판매조직', '영업중심조직']);

const linkedIds = (value) => (Array.isArray(value) ? value : []);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = authenticate(req);
    if (!session) {
        return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const month = String(req.query.month || 'all');
    if (month !== 'all' && !MONTH.test(month)) {
        return res.status(400).json({ error: 'Invalid month' });
    }

    try {
        // orgId는 서명된 토큰에서만 온다. 클라이언트 입력으로는 바꿀 수 없다.
        const org = await fetchRecord(TABLES.orgList, session.orgId, ORG_FIELDS);
        if (!org || !org.fields.OrgName) {
            return res.status(401).json({ error: '인증이 필요합니다.' });
        }

        // 기업명이 아니라 이 지점 레코드에 실제로 연결된 ID만 조회한다.
        // 같은 기업명이 지점별로 나뉘어 있어(신한라이프 11개, 인카금융서비스 6개 등)
        // 이름으로 필터하면 다른 지점의 환자 기록까지 딸려온다.
        const [specialist, checkup] = await Promise.all([
            fetchByIds(TABLES.specialist, linkedIds(org.fields.RequestSpecialist), SPECIALIST_FIELDS),
            fetchByIds(TABLES.checkup, linkedIds(org.fields.RequestCheckup), CHECKUP_FIELDS),
        ]);

        const label = [org.fields.OrgName, org.fields.BranchName].filter(Boolean).join(' ');

        res.setHeader('Cache-Control', 'no-store');
        const maskNames = MASK_CHECKUP_NAMES.has(org.fields.OrgCategory);

        return res.status(200).json(buildReport(label, specialist, checkup, month, maskNames));
    } catch (err) {
        console.error('report failed:', err.message);
        return res.status(500).json({ error: '데이터를 불러오지 못했습니다.' });
    }
}
