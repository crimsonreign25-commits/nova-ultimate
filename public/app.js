const statusButton = document.getElementById('statusButton');
const systemName = document.getElementById('systemName');
const systemVersion = document.getElementById('systemVersion');
const groqStatus = document.getElementById('groqStatus');
const featureCount = document.getElementById('featureCount');
const systemBadge = document.getElementById('systemBadge');
const responseBox = document.getElementById('responseBox');
const predictionsBox = document.getElementById('predictions');
const scanResult = document.getElementById('scanResult');

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    systemName.textContent = data.name || 'NOVA Ultimate';
    systemVersion.textContent = data.version || '1.0.0';
    featureCount.textContent = Array.isArray(data.features) ? data.features.length : '0';
    groqStatus.textContent = data.groqConfigured ? 'Configured' : 'Missing';
    systemBadge.textContent = data.status === 'operational' ? 'Operational' : 'Offline';
    systemBadge.style.background = data.status === 'operational' ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.12)';
    systemBadge.style.color = data.status === 'operational' ? '#86efac' : '#fca5a5';
    responseBox.textContent = 'NOVA is monitoring the system and ready to assist.';
  } catch (error) {
    responseBox.textContent = 'Unable to load system status.';
    console.error(error);
  }
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

document.getElementById('assistantForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.getElementById('messageInput').value.trim();
  if (!message) return;

  responseBox.textContent = 'Thinking...';
  try {
    const data = await postJson('/assist', { message, user_id: 'mobile-user' });
    responseBox.textContent = data.response || 'No response received.';
  } catch (error) {
    responseBox.textContent = 'There was an issue reaching NOVA.';
    console.error(error);
  }
});

document.getElementById('predictButton').addEventListener('click', async () => {
  const message = document.getElementById('messageInput').value.trim() || 'create a new app';
  try {
    const data = await postJson('/predict', { user_id: 'mobile-user', message });
    predictionsBox.innerHTML = (data.suggestions || []).map((s) => `
      <div class="prediction-pill">
        <span class="intent">${s.intent}</span>
        <span class="confidence">${(s.confidence * 100).toFixed(0)}%</span>
      </div>
    `).join('') || 'No suggestions available.';
  } catch (error) {
    predictionsBox.textContent = 'Unable to load predictions.';
    console.error(error);
  }
});

document.getElementById('scanForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = document.getElementById('scanInput').value.trim();
  if (!url) return;
  try {
    const data = await postJson('/scan-url', { url });
    scanResult.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    scanResult.textContent = 'Scan failed.';
    console.error(error);
  }
});

statusButton.addEventListener('click', loadStatus);
loadStatus();
