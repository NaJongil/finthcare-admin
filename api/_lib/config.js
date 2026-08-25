// 환경변수 누락은 배포 설정 문제다. 500으로 뭉뚱그리면 원인을 알 수 없어
// 503과 전용 메시지로 분리하고, 어떤 변수가 빠졌는지는 서버 로그에만 남긴다.
const REQUIRED = ['AIRTABLE_API_KEY', 'SESSION_SECRET'];

export function configError(res) {
    const missing = REQUIRED.filter((key) => !process.env[key]);
    if (!missing.length) return false;

    console.error(`missing environment variables: ${missing.join(', ')}`);
    res.status(503).json({ error: '서버 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.' });
    return true;
}
