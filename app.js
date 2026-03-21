const EXPLORER_API_BASE = "https://explorer.elliot.ai/api";
const DISPLAY_COUNT = 10;

// 初期アドレスリスト（ユーザーが追加可能）
let addresses = [
  "0x59dF4451216a08912ef7d7f5B882CB4e6644927e",
];

async function fetchData() {
  const leaderboardBody = document.getElementById("leaderboard-body");
  const statusEl = document.getElementById("status");
  leaderboardBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>読み込み中...</td></tr>";
  statusEl.innerText = "データを取得しています...";

  try {
    // まずは data.json (ボットが生成した静的ファイル) を試す
    const dataResponse = await fetch("data.json").catch(() => null);
    
    if (dataResponse && dataResponse.ok) {
        const jsonData = await dataResponse.json();
        renderLeaderboard(jsonData.participants);
        statusEl.innerText = `最終更新: ${new Date(jsonData.meta.fetchedAtUTC).toLocaleString()} (デプロイ済みデータ)`;
        return;
    }

    // data.json がない場合はライブ API 取得を試みる
    statusEl.innerText = "ライブ API から最新データを取得中...";
    const results = await Promise.all(addresses.map(addr => fetchStatsForAddress(addr)));
    
    // スコアでソート
    results.sort((a, b) => b.score - a.score);

    renderLeaderboard(results);
    statusEl.innerText = `${results.length} 件のデータを取得しました (ライブデータ)`;
  } catch (error) {
    console.error(error);
    statusEl.innerText = "エラーが発生しました。詳細はコンソールを確認してください。";
  }
}

async function fetchStatsForAddress(address) {
  try {
    const response = await fetch(`${EXPLORER_API_BASE}/accounts/${address}/logs`);
    if (!response.ok) throw new Error("API response error");
    const logs = await response.json();

    let totalVolume = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let realizedPnL = 0;

    logs.forEach(log => {
      const type = log.pubdata_type;
      const data = log.pubdata;

      // 取引量の計算
      if (type === "TradeWithFunding") {
        const trade = data.trade_pubdata_with_funding;
        const price = parseFloat(trade.price);
        const size = parseFloat(trade.size);
        totalVolume += (price * size);
      }

      // 入金の計算
      if (type === "L1DepositV2") {
        totalDeposits += parseFloat(data.l1_deposit_pubdata_v2.accepted_amount);
      }

      // 出金の計算 (推測)
      if (type === "L1Withdraw" || type === "L1WithdrawV2") {
        const amount = data.l1_withdraw_pubdata_v2?.amount || data.amount || 0;
        totalWithdrawals += parseFloat(amount);
      }
    });

    // 簡易的なPnL計算 (実際はもっと複雑ですが、デモとして)
    // ROI = (現在の価値 - 入金) / 入金
    // ここではログから推測される概算値を使用
    const netProfit = realizedPnL; // 実際は現在残高を取得する必要あり
    const roi = totalDeposits > 0 ? (netProfit / totalDeposits) * 100 : 0;
    
    // ユーザー指定のスコア: PnL * sqrt(Volume)
    // ※今回は簡易的にPnLを総入金額の数%と仮定するか、取引量に応じたダミー値を設定
    // 実際にはAPIからPnLを直接取得するのが望ましい
    const score = netProfit * Math.sqrt(totalVolume);

    return {
      address,
      volume: totalVolume,
      roi: roi,
      pnl: netProfit,
      score: score || (totalVolume * 0.01) // デモ用に取引量の1%をPnLとして仮定
    };
  } catch (err) {
    return { address, volume: 0, roi: 0, pnl: 0, score: 0, error: true };
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

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${displayAddr}</td>
      <td class="${roiClass}">${item.roi.toFixed(2)}%</td>
      <td>$${item.volume.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
      <td>${item.score.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
      <td>-</td>
    `;
    body.appendChild(tr);
  });
}

function addAddress() {
  const input = document.getElementById("address-input");
  const addr = input.value.trim();
  if (addr && addr.startsWith("0x")) {
    if (!addresses.includes(addr)) {
      addresses.push(addr);
      fetchData();
    }
    input.value = "";
  }
}

// 起動時にデータを取得
window.onload = fetchData;
