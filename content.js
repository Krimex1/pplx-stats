// content.js

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'startFullScan') startDeepScan();
});

async function startDeepScan() {
  console.log("[PPLX Stats] Начинаю глубокий сбор данных...");
  const allLinks = new Set();

  // 1. Ищем контейнер библиотеки. Обычно это элемент с overflow-y: auto
  // Мы попробуем найти его по наличию ссылок на чаты внутри.
  let scrollContainer = document.querySelector('main') || document.body;

  const findContainer = () => {
    const links = document.querySelectorAll('a[href*="/search/"]');
    if (links.length > 0) return links[0].closest('div[class*="overflow-y-auto"]') || window;
    return window;
  };

  const container = findContainer();
  let lastSize = 0;
  let idleCycles = 0;

  // Цикл прокрутки и сбора
  while (idleCycles < 8) {
    const currentLinks = document.querySelectorAll('a[href*="/search/"]');
    currentLinks.forEach(a => allLinks.add(a.href));
    console.log(`[PPLX Stats] Найдено ссылок: ${allLinks.size}`);

    // Имитируем прокрутку колесиком мыши для срабатывания подгрузки
    if (container === window) {
      window.scrollBy(0, 2000);
    } else {
      container.scrollTop += 2000;
    }

    // Генерируем фейковое событие скролла
    container.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, bubbles: true }));
    await new Promise(r => setTimeout(r, 2000));

    if (allLinks.size === lastSize) {
      idleCycles++;
    } else {
      idleCycles = 0;
      lastSize = allLinks.size;
    }
  }

  const chatLinks = Array.from(allLinks);
  console.log(`[PPLX Stats] Сбор ссылок окончен. Всего: ${chatLinks.length}. Начинаю парсинг содержимого...`);

  // Переходим к анализу через iframe (как в предыдущем шаге)
  await runAnalysis(chatLinks);
}

async function runAnalysis(links) {
  let stats = { chats: [], summary: { totalChats: 0, totalMessages: 0, totalTokens: 0, modelsUsage: {} } };
  let frame = document.createElement('iframe');
  frame.style.cssText = "position:fixed; width:1px; height:1px; opacity:0; pointer-events:none;";
  document.body.appendChild(frame);

  for (let i = 0; i < links.length; i++) {
    chrome.runtime.sendMessage({ type: 'SCAN_PROGRESS', current: i + 1, total: links.length });
    try {
      const data = await parseThread(frame, links[i]);
      stats.summary.totalChats++;
      stats.summary.totalMessages += data.msgs;
      stats.summary.totalTokens += data.tokens;
      const m = data.model;
      if (!stats.summary.modelsUsage[m]) stats.summary.modelsUsage[m] = { chats: 0, tokens: 0 };
      stats.summary.modelsUsage[m].chats++;
      stats.summary.modelsUsage[m].tokens += data.tokens;
    } catch (e) { console.error("Skip thread:", links[i]); }
    await new Promise(r => setTimeout(r, 300));
  }

  document.body.removeChild(frame);
  chrome.storage.local.set(stats, () => {
    chrome.runtime.sendMessage({ type: 'SCAN_FINISHED', data: stats.summary });
  });
}

function parseThread(frame, url) {
  return new Promise((resolve) => {
    frame.src = url;
    let checks = 0;
    const interval = setInterval(() => {
      checks++;
      try {
        const doc = frame.contentDocument;
        // Ищем по набору вероятных селекторов
        const msgs = doc.querySelectorAll('.prose, [data-testid="message-answer"], .default.font-sans');
        if (msgs.length > 0 || checks > 12) {
          clearInterval(interval);
          let text = "";
          msgs.forEach(m => text += m.innerText);
          const model = doc.querySelector('[data-testid="model-badge"]')?.innerText || "Standard";
          resolve({ msgs: msgs.length, tokens: Math.ceil(text.length / 4), model: model });
        }
      } catch (e) {}
    }, 1000);
    setTimeout(() => { clearInterval(interval); resolve({msgs:0, tokens:0, model:"Timeout"}); }, 15000);
  });
}