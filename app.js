async function fetchData() {
  const statusEl = document.getElementById("status");
  statusEl.innerText = "データを取得しています...";

  try {
    const dataResponse = await fetch("data.json");

    if (!dataResponse.ok) {
      statusEl.innerText = "データが見つかりません。GitHub Actions でデータが生成されるまでお待ちください。";
      return;
    }

    const jsonData = await dataResponse.json();
    const participants = jsonData.participants;

    // ROIランキング（ROI降順）
    const roiSorted = [...participants].sort((a, b) => b.roi - a.roi);
    renderRoiRanking(roiSorted);

    // Volumeランキング（Volume降順）
    const volSorted = [...participants].sort((a, b) => b.tradingVolume - a.tradingVolume);
    renderVolRanking(volSorted, jsonData.meta.totalVolumeUSDT);

    statusEl.innerText = `最終更新: ${new Date(jsonData.meta.fetchedAtUTC).toLocaleString()}`;
  } catch (error) {
    console.error(error);
    statusEl.innerText = "エラーが発生しました。詳細はコンソールを確認してください。";
  }
}

function traderCell(item) {
  const displayAddr = `${item.address.substring(0, 6)}...${item.address.substring(item.address.length - 4)}`;
  const nameLabel = item.displayName || displayAddr;
  const xLink = item.xAccount
    ? `<a href="https://x.com/${item.xAccount.replace('@', '')}" target="_blank" rel="noopener" style="color: var(--text-secondary); font-size: 0.85em; text-decoration: none;">${item.xAccount}</a>`
    : "";
  return `${nameLabel}${xLink ? `<br>${xLink}` : ""}`;
}

function renderRoiRanking(data) {
  const body = document.getElementById("roi-ranking-body");
  body.innerHTML = "";

  data.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.className = "animate-fade-in";
    tr.style.animationDelay = `${index * 0.05}s`;

    const roiClass = item.roi >= 0 ? "roi-positive" : "roi-negative";
    const pnl = item.pnl || 0;
    const pnlClass = pnl >= 0 ? "roi-positive" : "roi-negative";

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${traderCell(item)}</td>
      <td class="${roiClass}">${(item.roi || 0).toFixed(2)}%</td>
      <td class="${pnlClass}">$${pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
    `;
    body.appendChild(tr);
  });
}

function renderVolRanking(data, totalVolume) {
  const totalEl = document.getElementById("vol-total");
  if (totalEl && totalVolume != null) {
    totalEl.textContent = `$${totalVolume.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  const body = document.getElementById("vol-ranking-body");
  body.innerHTML = "";

  data.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.className = "animate-fade-in";
    tr.style.animationDelay = `${index * 0.05}s`;

    const vol = item.tradingVolume || 0;
    const score = item.score || 0;

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${traderCell(item)}</td>
      <td>$${vol.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
      <td>${score.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
    `;
    body.appendChild(tr);
  });
}

// 起動時にデータを取得
window.onload = fetchData;