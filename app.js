async function fetchData() {
  const leaderboardBody = document.getElementById("leaderboard-body");
  const statusEl = document.getElementById("status");
  leaderboardBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>読み込み中...</td></tr>";
  statusEl.innerText = "データを取得しています...";

  try {
    const dataResponse = await fetch("data.json");

    if (!dataResponse.ok) {
      statusEl.innerText = "データが見つかりません。GitHub Actions でデータが生成されるまでお待ちください。";
      leaderboardBody.innerHTML = "";
      return;
    }

    const jsonData = await dataResponse.json();
    renderLeaderboard(jsonData.participants);
    statusEl.innerText = `最終更新: ${new Date(jsonData.meta.fetchedAtUTC).toLocaleString()}`;
  } catch (error) {
    console.error(error);
    statusEl.innerText = "エラーが発生しました。詳細はコンソールを確認してください。";
  }
}

function renderLeaderboard(data) {
  const body = document.getElementById("leaderboard-body");
  body.innerHTML = "";

  data.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.className = "animate-fade-in";
    tr.style.animationDelay = `${index * 0.1}s`;

    const displayAddr = `${item.address.substring(0, 6)}...${item.address.substring(item.address.length - 4)}`;
    const roiClass = item.roi >= 0 ? "roi-positive" : "roi-negative";

    const vol = item.tradingVolume || 0;
    const score = item.score || 0;
    const roi = item.roi || 0;

    const nameLabel = item.displayName || displayAddr;
    const xLink = item.xAccount
      ? `<a href="https://x.com/${item.xAccount.replace('@', '')}" target="_blank" rel="noopener" style="color: var(--text-secondary); font-size: 0.85em; text-decoration: none;">${item.xAccount}</a>`
      : "";

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${nameLabel}${xLink ? `<br>${xLink}` : ""}</td>
      <td class="${roiClass}">${roi.toFixed(2)}%</td>
      <td>$${vol.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
      <td>${score.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
      <td>-</td>
    `;
    body.appendChild(tr);
  });
}

// 起動時にデータを取得
window.onload = fetchData;