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
}
