// k6 压测：单人模式并发对局
//
// 跑法：
//   k6 run -e BASE=http://127.0.0.1:8080 -e VUS=20 server/scripts/k6_solo.js
//
// 关注三个数（写进验收标准）：
//   · http_req_duration{api:create}  p95 < 800ms
//   · 单轮推进间隔（turn_gap）        p95 < 8s
//   · http_req_failed                < 0.5%
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://127.0.0.1:8080';
const VUS = Number(__ENV.VUS || 10);

const createTrend = new Trend('api_create_ms', true);
const turnGap = new Trend('turn_gap_ms', true);

export const options = {
  scenarios: {
    solo: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '6m',
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.005'],
    'api_create_ms': ['p(95)<800'],
    'turn_gap_ms': ['p(95)<8000'],
  },
};

function jpost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return http.post(BASE + path, JSON.stringify(body), { headers });
}

function jget(path, token) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  return http.get(BASE + path, { headers });
}

export default function () {
  const acc = 'k6_' + __VU + '_' + Date.now();
  const reg = jpost('/api/auth/register', { account: acc, password: 'Test123456' });
  check(reg, { '注册 200': (r) => r.status === 200 });
  const token = reg.json('token');
  if (!token) return;

  // 充一点钱，避免余额不足挡住开局
  const order = jpost('/api/pay/orders', { amountCents: 2000 }, token).json();
  if (order && order.orderId) {
    jpost('/api/pay/callback',
      { orderId: order.orderId, amountCents: 2000, sign: order.sign }, token);
  }

  const t0 = Date.now();
  const mk = jpost('/api/matches',
    { topicId: 't4', seats: ['B2'], mode: 'SPRINT', tier: 'PRO' }, token);
  createTrend.add(Date.now() - t0);
  check(mk, { '开局 200': (r) => r.status === 200 });
  const mid = mk.json('matchId');
  if (!mid) return;

  // 打两三步：等 AI 说完 → 轮到我时提交
  let lastTurns = 0;
  let lastChange = Date.now();
  for (let i = 0; i < 120; i++) {
    sleep(1);
    const d = jget('/api/matches/' + mid, token);
    if (d.status !== 200) break;
    const j = d.json();
    const n = (j.turns || []).length;
    if (n > lastTurns) {
      turnGap.add(Date.now() - lastChange);
      lastTurns = n;
      lastChange = Date.now();
    }
    if (j.waitingForMe) {
      jpost('/api/matches/' + mid + '/turns',
        { content: '我方认为取消期末考试需要替代评价同等刚性，请问对方：复核主体是谁？', inputType: 'kb' },
        token);
    }
    if ((j.match && j.match.status) !== 'RUNNING') break;
    if (n >= 4) break;
  }
}
