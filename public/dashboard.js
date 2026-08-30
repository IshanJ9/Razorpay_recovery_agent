const runBtn = document.getElementById('run-both-btn');
const runStatus = document.getElementById('run-status');
let agentBatchId = null;
let naiveBatchId = null;

runBtn.addEventListener('click', async () => {
  const count = Number(document.getElementById('count-input').value);
  const seed = Number(document.getElementById('seed-input').value);
  runBtn.disabled = true;
  runStatus.textContent = 'Creating batches...';

  const createRes = await fetch('/api/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, seed, strategy: 'BOTH' }),
  });
  const { batches } = await createRes.json();
  agentBatchId = batches.find((b) => b.strategy === 'AGENT').id;
  naiveBatchId = batches.find((b) => b.strategy === 'NAIVE').id;

  runStatus.textContent = 'Running agent strategy...';
  await fetch(`/api/batches/${agentBatchId}/run`, { method: 'POST' });
  runStatus.textContent = 'Running naive baseline...';
  await fetch(`/api/batches/${naiveBatchId}/run`, { method: 'POST' });

  runStatus.textContent = 'Loading report...';
  await loadReport();
  await loadEvents();
  runBtn.disabled = false;
  runStatus.textContent = 'Done';
});

function formatRupees(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function loadReport() {
  const [agentReportRes, naiveReportRes] = await Promise.all([
    fetch(`/api/batches/${agentBatchId}/report`),
    fetch(`/api/batches/${naiveBatchId}/report`),
  ]);
  const agentReport = await agentReportRes.json();
  const naiveReport = await naiveReportRes.json();

  document.getElementById('summary-cards').hidden = false;
  document.getElementById('at-risk-value').textContent = formatRupees(agentReport.atRiskPaise);
  document.getElementById('agent-recovered-value').textContent =
    `${formatRupees(agentReport.recoveredPaise)} (${(agentReport.recoveryRate * 100).toFixed(1)}%)`;
  document.getElementById('naive-recovered-value').textContent =
    `${formatRupees(naiveReport.recoveredPaise)} (${(naiveReport.recoveryRate * 100).toFixed(1)}%)`;
  const delta = (agentReport.recoveryRate - naiveReport.recoveryRate) * 100;
  document.getElementById('delta-value').textContent = `+${delta.toFixed(1)} pts`;

  renderBreakdownChart(agentReport.byFailureReason);
}

function renderBreakdownChart(rows) {
  const svg = document.getElementById('breakdown-chart');
  document.getElementById('breakdown-section').hidden = false;
  svg.innerHTML = '';
  const barWidth = 60;
  rows.forEach((row, i) => {
    const rate = row.count === 0 ? 0 : row.recoveredCount / row.count;
    const barHeight = rate * 180;
    const x = i * (barWidth + 20) + 20;
    const y = 200 - barHeight;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', barHeight);
    svg.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', 220);
    label.textContent = row.key;
    svg.appendChild(label);
  });
}

async function loadEvents() {
  const res = await fetch(`/api/batches/${agentBatchId}/events`);
  const { events } = await res.json();
  document.getElementById('events-section').hidden = false;
  document.getElementById('escalation-section').hidden = false;

  const body = document.getElementById('events-body');
  body.innerHTML = '';
  const escalationList = document.getElementById('escalation-list');
  escalationList.innerHTML = '';

  for (const event of events) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatRupees(event.amountPaise)}</td>
      <td>${event.type}</td>
      <td>${event.failureReason ?? '-'}</td>
      <td>${event.status}</td>
      <td><button data-event-id="${event.id}" class="view-audit-btn">View audit</button></td>
    `;
    body.appendChild(row);

    if (event.status === 'ESCALATED') {
      const li = document.createElement('li');
      li.textContent = `${formatRupees(event.amountPaise)} - ${event.failureReason}`;
      escalationList.appendChild(li);
    }
  }

  document.querySelectorAll('.view-audit-btn').forEach((btn) => {
    btn.addEventListener('click', () => showAuditTrail(btn.dataset.eventId));
  });
}

async function showAuditTrail(eventId) {
  const res = await fetch(`/api/events/${eventId}/audit`);
  const { entries } = await res.json();
  const list = document.getElementById('audit-list');
  list.innerHTML = '';
  for (const entry of entries) {
    const li = document.createElement('li');
    li.textContent = `[${entry.step}] ${new Date(entry.createdAt).toLocaleString()} - ${JSON.stringify(entry.detail)}`;
    list.appendChild(li);
  }
  document.getElementById('audit-drawer').showModal();
}

document.getElementById('close-drawer-btn').addEventListener('click', () => {
  document.getElementById('audit-drawer').close();
});
