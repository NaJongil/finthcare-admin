// GET /api/report?month=2026-07|all   Authorization: Bearer <token>
import { TABLES, fetchAll, quote } from './_lib/airtable.js';
import { authenticate } from './_lib/token.js';
import { buildReport } from './_lib/transform.js';

const MONTH = /^\d{4}-\d{2}$/;

const SPECIALIST_FIELDS = [
    'SubmittedAt', 'RelatedMember', 'PatientName', 'MemberPatientRelation',
    'DiseaseCategory1', 'DiseaseName', 'Status', 'Hospital1', 'Department1',
    'Specialist1', 'Specialist2', 'Specialist3', 'WaitingTime', 'Appointment1',
    'RecommendReason1', '월별', 'OrgName (from OrgName)',
];

const CHECKUP_FIELDS = [
    'SubmittedAt', 'RelatedMember', 'PatientName', 'MemberPatientRelation',
    'Hospital', 'HospitalBranch', 'Program', 'CheckupDate', 'Status',
    'TotalPrice', '월별', 'OrgName (from OrgName)',
];

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

    // orgName은 서명된 토큰에서만 온다. 클라이언트 입력으로는 바꿀 수 없다.
    const orgFilter = `ARRAYJOIN({OrgName (from OrgName)}) = ${quote(session.org)}`;

    try {
        const [specialist, checkup] = await Promise.all([
            fetchAll(TABLES.specialist, orgFilter, SPECIALIST_FIELDS),
            fetchAll(TABLES.checkup, orgFilter, CHECKUP_FIELDS),
        ]);

        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(buildReport(session.org, specialist, checkup, month));
    } catch (err) {
        console.error('report failed:', err.message);
        return res.status(500).json({ error: '데이터를 불러오지 못했습니다.' });
    }
}
