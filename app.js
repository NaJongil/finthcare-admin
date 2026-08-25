// 핀스케어 이용 현황 대시보드
// 서버가 이미 매핑·익명화·집계를 끝낸 JSON만 받는다. 이 파일은 그리기만 한다.

const TOKEN_KEY = 'fc.token';
const PAGE_SIZE = 10;

const $ = (id) => document.getElementById(id);

const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

const won = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') + '원' : '–');

const BADGE_CLASS = {
    '진행 중': 'badge--progress',
    '추천 예약 제공': 'badge--booked',
    '할인 예약 제공': 'badge--booked',
    '상담 제공': 'badge--consult',
};

const badge = (status) =>
    `<span class="badge ${BADGE_CLASS[status] || 'badge--consult'}">${esc(status)}</span>`;

let report = null;
const shown = { specialist: PAGE_SIZE, checkup: PAGE_SIZE };

/* ── 세션 ─────────────────────────────────────────────── */

const getToken = () => sessionStorage.getItem(TOKEN_KEY);

function endSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
}

/* ── 로그인 ───────────────────────────────────────────── */

$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = $('loginBtn');
    const error = $('loginError');
    const accessCode = $('accessCode').value.trim();

    if (!accessCode) return;

    btn.disabled = true;
    btn.textContent = '확인 중…';
    error.hidden = true;

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '접속 코드가 올바르지 않습니다.');

        // 토큰만 저장한다. 기업 데이터는 저장하지 않는다.
        sessionStorage.setItem(TOKEN_KEY, data.token);
        await openDashboard();
    } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
    } finally {
        btn.disabled = false;
        btn.textContent = '접속하기';
    }
});

$('logoutBtn').addEventListener('click', endSession);

/* ── 대시보드 ─────────────────────────────────────────── */

async function openDashboard() {
    const res = await fetch('/api/report', {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 401) {
        endSession();
        throw new Error('세션이 만료되었습니다.');
    }
    if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || '요청에 실패했습니다.');
    }
    report = await res.json();

    $('loginScreen').hidden = true;
    $('dashboard').hidden = false;
    $('orgName').textContent = report.orgName;

    renderSummary();
    renderSpecialist();
    renderCheckup();
}

function renderSummary() {
    const s = report.summary;

    const counts = Object.entries(s.statusCounts)
        .map(([status, n]) => `<span class="badge ${BADGE_CLASS[status] || 'badge--consult'}">${esc(status)}<b>${n}</b></span>`)
        .join('');

    $('summary').innerHTML = `
        <div class="summary-label">누적 이용</div>
        <div class="summary-total"><strong>${s.total}</strong><span>건</span></div>
        <div class="summary-breakdown">
            <span>명의예약 <b>${s.specialistTotal}건</b></span>
            <span>건강검진 <b>${s.checkupTotal}건</b></span>
        </div>
        ${counts ? `<div class="status-counts">${counts}</div>` : ''}
    `;
}

/* ── 명의예약 ─────────────────────────────────────────── */

const SPECIALIST_COLS = 11;

function renderSpecialist() {
    const rows = report.specialist;
    const box = $('specialistBody');

    if (!rows.length) {
        box.innerHTML = '<div class="empty-state">아직 명의예약 이용 내역이 없습니다.</div>';
        return;
    }

    const visible = rows.slice(0, shown.specialist);

    const body = visible
        .map((r, i) => {
            const row = `
                <tr>
                    <td class="num">${esc(r.submitted)}</td>
                    <td>${esc(r.user)}</td>
                    <td>${esc(r.patient)}</td>
                    <td>${esc(r.relation)}</td>
                    <td>${esc(r.disease)}</td>
                    <td>${badge(r.status)}</td>
                    <td>${esc(r.hospital)}</td>
                    <td>${esc(r.department)}</td>
                    <td>${esc(r.specialist)}</td>
                    <td class="num">${esc(r.waiting)}</td>
                    <td class="num">${esc(r.appointment)}</td>
                </tr>`;

            if (!r.reason) return row;

            return row + `
                <tr class="reason-row">
                    <td colspan="${SPECIALIST_COLS}">
                        <button type="button" class="reason-toggle" data-reason="sp-${i}">추천 사유 보기</button>
                        <div class="reason-box" id="sp-${i}" hidden>${esc(r.reason)}</div>
                    </td>
                </tr>`;
        })
        .join('');

    const cards = visible
        .map((r, i) => `
            <div class="record-card">
                <div class="record-card-head">
                    <span class="record-card-date">${esc(r.submitted)}</span>
                    ${badge(r.status)}
                </div>
                <dl>
                    <dt>신청자</dt><dd>${esc(r.user)}</dd>
                    <dt>환자</dt><dd>${esc(r.patient)} (${esc(r.relation)})</dd>
                    <dt>질환</dt><dd>${esc(r.disease)}</dd>
                    <dt>예약병원</dt><dd>${esc(r.hospital)} ${esc(r.department)}</dd>
                    <dt>의료진</dt><dd>${esc(r.specialist)}</dd>
                    <dt>대기</dt><dd>${esc(r.waiting)}</dd>
                    <dt>진료일</dt><dd>${esc(r.appointment)}</dd>
                </dl>
                ${r.reason ? `
                    <button type="button" class="reason-toggle" data-reason="spm-${i}">추천 사유 보기</button>
                    <div class="reason-box" id="spm-${i}" hidden>${esc(r.reason)}</div>` : ''}
            </div>`)
        .join('');

    box.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>신청일</th><th>신청자</th><th>환자</th><th>관계</th><th>질환</th>
                        <th>상태</th><th>예약병원</th><th>진료과</th><th>의료진</th><th>대기</th><th>진료일</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
            ${moreButton('specialist', rows.length)}
        </div>
        <div class="record-cards">
            ${cards}
            ${moreButton('specialist', rows.length)}
        </div>`;
}

/* ── 건강검진 ─────────────────────────────────────────── */

function renderCheckup() {
    const rows = report.checkup;

    // 검진 데이터가 아예 없는 기업에는 섹션을 노출하지 않는다.
    if (!rows.length) {
        $('checkupSection').hidden = true;
        return;
    }
    $('checkupSection').hidden = false;

    const visible = rows.slice(0, shown.checkup);

    const body = visible
        .map((r) => `
            <tr>
                <td class="num">${esc(r.submitted)}</td>
                <td>${esc(r.user)}</td>
                <td>${esc(r.patient)}</td>
                <td>${esc(r.relation)}</td>
                <td>${esc(r.center)}</td>
                <td class="program">${esc(r.program)}</td>
                <td class="num">${esc(r.checkupDate)}</td>
                <td>${badge(r.status)}</td>
                <td class="num">${won(r.amount)}</td>
            </tr>`)
        .join('');

    const cards = visible
        .map((r) => `
            <div class="record-card">
                <div class="record-card-head">
                    <span class="record-card-date">${esc(r.submitted)}</span>
                    ${badge(r.status)}
                </div>
                <dl>
                    <dt>신청자</dt><dd>${esc(r.user)}</dd>
                    <dt>수검자</dt><dd>${esc(r.patient)} (${esc(r.relation)})</dd>
                    <dt>검진센터</dt><dd>${esc(r.center)}</dd>
                    <dt>프로그램</dt><dd>${esc(r.program)}</dd>
                    <dt>검진일</dt><dd>${esc(r.checkupDate)}</dd>
                    <dt>결제금액</dt><dd>${won(r.amount)}</dd>
                </dl>
            </div>`)
        .join('');

    $('checkupBody').innerHTML = `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>신청일</th><th>신청자</th><th>수검자</th><th>관계</th><th>검진센터</th>
                        <th>프로그램</th><th>검진일</th><th>상태</th><th>결제금액</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
            ${moreButton('checkup', rows.length)}
        </div>
        <div class="record-cards">
            ${cards}
            ${moreButton('checkup', rows.length)}
        </div>`;
}

const moreButton = (kind, total) =>
    shown[kind] >= total
        ? ''
        : `<button type="button" class="table-more" data-more="${kind}">더 보기 (${total - shown[kind]}건)</button>`;

/* ── 위임 이벤트 ──────────────────────────────────────── */

document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-reason]');
    if (toggle) {
        const box = $(toggle.dataset.reason);
        box.hidden = !box.hidden;
        toggle.textContent = box.hidden ? '추천 사유 보기' : '추천 사유 접기';
        return;
    }

    const more = e.target.closest('[data-more]');
    if (more) {
        const kind = more.dataset.more;
        shown[kind] += PAGE_SIZE;
        if (kind === 'specialist') renderSpecialist();
        else renderCheckup();
    }
});

/* ── 후기 ─────────────────────────────────────────────── */
// 롤링·드래그·모달은 CSS scroll-snap으로 대체했다. 여기서는 카드만 찍는다.

async function initFeedbacks() {
    let items = [];
    try {
        const res = await fetch('/feedbacks.json');
        if (res.ok) items = await res.json();
    } catch {
        // 후기는 부가 정보다. 실패해도 대시보드는 그대로 뜬다.
    }
    if (!Array.isArray(items) || !items.length) return;

    $('feedbackRow').innerHTML = items
        .map((f) => `
            <article class="feedback-card">
                <p class="feedback-headline">${esc(f.headline)}</p>
                <p class="feedback-body">${esc(f.body)}</p>
                ${f.userType ? `<p class="feedback-type">${esc(f.userType)}</p>` : ''}
            </article>`)
        .join('');

    $('feedbackSection').hidden = false;
}

/* ── 시작 ─────────────────────────────────────────────── */

initFeedbacks();

if (getToken()) {
    openDashboard().catch(() => sessionStorage.removeItem(TOKEN_KEY));
}
