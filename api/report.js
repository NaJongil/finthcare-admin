// GET /api/report   Authorization: Bearer <token>
import { TABLES, fetchRecord, fetchByIds } from './_lib/airtable.js';
import { authenticate } from './_lib/token.js';
import { configError } from './_lib/config.js';
import { buildReport } from './_lib/transform.js';

const SPECIALIST_FIELDS = [
    'SubmittedAt', 'RelatedMember', 'PatientName', 'MemberPatientRelation',
    'DiseaseCategory1', 'DiseaseName', 'Status', 'Hospital1', 'Department1',
    'Specialist1', 'Specialist2', 'Specialist3', 'WaitingTime', 'Appointment1',
    'RecommendReason1',
];

const CHECKUP_FIELDS = [
    'SubmittedAt', 'RelatedMember', 'PatientName', 'MemberPatientRelation',
    'Hospital', 'HospitalBranch', 'Program', 'CheckupDate', 'Status', 'TotalPrice',
];

const ORG_FIELDS = ['OrgName', 'RequestSpecialist', 'RequestCheckup'];

const linkedIds = (value) => (Array.isArray(value) ? value : []);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (configError(res)) return;

    const session = authenticate(req);
    if (!session) {
        return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    try {
        // orgId는 서명된 토큰에서만 온다. 클라이언트 입력으로는 바꿀 수 없다.
        const org = await fetchRecord(TABLES.orgList, session.orgId, ORG_FIELDS);
        if (!org || !org.fields.OrgName) {
            return res.status(401).json({ error: '인증이 필요합니다.' });
        }

        // 기업명이 아니라 이 레코드에 실제로 연결된 ID만 조회한다.
        const [specialist, checkup] = await Promise.all([
            fetchByIds(TABLES.specialist, linkedIds(org.fields.RequestSpecialist), SPECIALIST_FIELDS),
            fetchByIds(TABLES.checkup, linkedIds(org.fields.RequestCheckup), CHECKUP_FIELDS),
        ]);

        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(buildReport(org.fields.OrgName, specialist, checkup));
    } catch (err) {
        console.error('report failed:', err.message);
        return res.status(500).json({ error: '데이터를 불러오지 못했습니다.' });
    }
}
