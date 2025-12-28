const scanBtn = document.getElementById('scanBtn');
const progressBar = document.getElementById('progressBar');
const progressSection = document.getElementById('progressSection');
const statusText = document.getElementById('statusText');

scanBtn.onclick = () => {
  scanBtn.disabled = true;
  progressSection.style.display = 'block';
  statusText.innerText = 'Инициализация...';
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'startFullScan' });
  });
};

// Слушаем обновления прогресса от content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCAN_PROGRESS') {
    const percent = Math.round((msg.current / msg.total) * 100);
    progressBar.style.width = percent + '%';
    statusText.innerText = `Обработка: ${msg.current} из ${msg.total} чатов...`;
  }
  if (msg.type === 'SCAN_FINISHED') {
    statusText.innerText = 'Анализ завершен!';
    scanBtn.disabled = false;
    displayStats(msg.data);
  }
});

function displayStats(data) {
  document.getElementById('results').style.display = 'block';
  document.getElementById('totalChats').innerText = data.totalChats;
  document.getElementById('totalMsgs').innerText = data.totalMessages;
  document.getElementById('totalTokens').innerText = data.totalTokens.toLocaleString();
  const modelDiv = document.getElementById('modelStats');
  modelDiv.innerHTML = Object.entries(data.modelsUsage).map(([model, info]) => 
    `<div style="margin: 4px 0;">🤖 ${model}: ${info.chats} чатов (~${info.tokens.toLocaleString()} токенов)</div>`
  ).join('');
}