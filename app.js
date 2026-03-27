// リワードテーブルデータ（3ティア）
const REWARD_TIERS = [
  {
    label: "Total Volume > $50M",
    threshold: 50_000_000,
    roi: [80000, 50000, 40000, 30000, 20000, 10000, 10000, 10000, 10000, 10000],
    vol: [70000, 50000, 40000, 30000, 20000, 10000, 10000, 10000, 10000, 10000],
  },
  {
    label: "Total Volume > $30M",
    threshold: 30_000_000,
    roi: [50000, 40000, 30000, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
    vol: [50000, 40000, 30000, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
  },
  {
    label: "Total Volume < $30M",
    threshold: 0,
    roi: [50000, 40000, 30000, 10000, 10000, 10000],
    vol: [50000, 40000, 30000, 10000, 10000, 10000],
  },
];

const VOLUME_QUALIFY_THRESHOLD = 10_000;
const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const INITIAL_DISPLAY_COUNT = 20;

function getActiveTierIndex(totalVolume) {
  if (totalVolume >= 50_000_000) return 0;
  if (totalVolume >= 30_000_000) return 1;
  return 2;
}

function rankCell(index) {
  const medal = RANK_MEDALS[index];
  return medal ? `${medal} ${index + 1}` : `${index + 1}`;
}

function renderRewardTables(totalVolume) {
  const volEl = document.getElementById("reward-vol");
  if (volEl && totalVolume != null) {
    volEl.textContent = `$${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  const activeIdx = totalVolume != null ? getActiveTierIndex(totalVolume) : -1;

  // タブ
  const tabsEl = document.getElementById("tier-tabs");
  const tierColors = ["tier-tab--red", "tier-tab--green", "tier-tab--blue"];
  tabsEl.innerHTML = REWARD_TIERS.map((tier, i) =>
    `<button class="tier-tab ${tierColors[i]}${i === activeIdx ? " tier-tab--active" : ""}" data-tier="${i}">${tier.label}${i === activeIdx ? " ◀ 現在" : ""}</button>`
  ).join("");

  // テーブル
  const tablesEl = document.getElementById("reward-tables");
  renderTierDetail(tablesEl, activeIdx >= 0 ? activeIdx : 0);

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tier-tab");
    if (!btn) return;
    const idx = parseInt(btn.dataset.tier, 10);
    tabsEl.querySelectorAll(".tier-tab").forEach((b, i) => {
      b.classList.toggle("tier-tab--selected", i === idx);
    });
    renderTierDetail(tablesEl, idx);
  });
}

function renderTierDetail(container, tierIdx) {
  const tier = REWARD_TIERS[tierIdx];

  function makeRows(arr) {
    const groups = [];
    let i = 0;
    while (i < arr.length) {
      const yen = arr[i];
      let j = i;
      while (j < arr.length && arr[j] === yen) j++;
      const rankLabel = j - 1 === i ? `${i + 1}` : `${i + 1}-${j}`;
      groups.push(`<tr><td>${rankLabel}</td><td>¥${yen.toLocaleString()}</td><td>Wagyu gift</td></tr>`);
      i = j;
    }
    return groups.join("");
  }

  container.innerHTML = `
    <div class="reward-pair">
      <div class="reward-col">
        <h3>ROI 部門</h3>
        <table class="reward-table">
          <thead><tr><th>Rank</th><th>賞品額</th><th>賞品</th></tr></thead>
          <tbody>${makeRows(tier.roi)}</tbody>
        </table>
      </div>
      <div class="reward-col">
        <h3>Trading Vol. 部門</h3>
        <table class="reward-table">
          <thead><tr><th>Rank</th><th>賞品額</th><th>賞品</th></tr></thead>
          <tbody>${makeRows(tier.vol)}</tbody>
        </table>
      </div>
    </div>`;
}

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

    const totalVolume = jsonData.meta.totalVolumeUSDT;
    const tierIdx = totalVolume != null ? getActiveTierIndex(totalVolume) : 2;
    const tier = REWARD_TIERS[tierIdx];

    // ROIランキング（ROI降順）
    const roiSorted = [...participants].sort((a, b) => b.roi - a.roi);
    renderRoiRanking(roiSorted, tier.roi.length);

    // Volumeランキング（Volume降順）
    const volSorted = [...participants].sort((a, b) => b.tradingVolume - a.tradingVolume);
    renderVolRanking(volSorted, totalVolume, tier.vol.length);

    // リワードテーブル
    renderRewardTables(totalVolume);

    statusEl.innerText = `最終更新: ${new Date(jsonData.meta.fetchedAtUTC).toLocaleString()}`;
  } catch (error) {
    console.error(error);
    statusEl.innerText = "エラーが発生しました。詳細はコンソールを確認してください。";
  }
}

function traderCell(item) {
  const displayAddr = `${item.address.substring(0, 6)}...${item.address.substring(item.address.length - 4)}`;
  const nameLabel = item.displayName || displayAddr;
  const qualified = (item.tradingVolume || 0) >= VOLUME_QUALIFY_THRESHOLD;
  const badge = qualified ? ' <span class="qualify-badge" title="Vol. $10,000+ 達成">✅</span>' : "";
  const xLink = item.xAccount
    ? `<a href="https://x.com/${item.xAccount.replace('@', '')}" target="_blank" rel="noopener" style="color: var(--text-secondary); font-size: 0.85em; text-decoration: none;">${item.xAccount}</a>`
    : "";
  return `${nameLabel}${badge}${xLink ? `<br>${xLink}` : ""}`;
}

function buildPageTabs(container, totalCount, activePage, onSelect) {
  const pageSize = INITIAL_DISPLAY_COUNT;
  const pageCount = Math.ceil(totalCount / pageSize);
  if (pageCount <= 1) return;

  let tabsEl = container.querySelector(".page-tabs");
  if (!tabsEl) {
    tabsEl = document.createElement("div");
    tabsEl.className = "page-tabs";
    container.querySelector(".table-responsive").before(tabsEl);
  }

  tabsEl.innerHTML = Array.from({ length: pageCount }, (_, i) => {
    const from = i * pageSize + 1;
    const to = Math.min((i + 1) * pageSize, totalCount);
    return `<button class="page-tab${i === activePage ? " page-tab--active" : ""}" data-page="${i}">${from}-${to}</button>`;
  }).join("");

  tabsEl.onclick = (e) => {
    const btn = e.target.closest(".page-tab");
    if (!btn) return;
    onSelect(parseInt(btn.dataset.page, 10));
  };
}

function renderRoiPage(body, data, page, prizeCount) {
  body.innerHTML = "";
  const start = page * INITIAL_DISPLAY_COUNT;
  const slice = data.slice(start, start + INITIAL_DISPLAY_COUNT);

  slice.forEach((item, i) => {
    const index = start + i;
    const tr = document.createElement("tr");
    tr.className = "animate-fade-in";
    tr.style.animationDelay = `${i * 0.03}s`;
    if (index < prizeCount) tr.classList.add("rank-prize");

    const roiClass = item.roi >= 0 ? "roi-positive" : "roi-negative";
    const pnl = item.pnl || 0;
    const pnlClass = pnl >= 0 ? "roi-positive" : "roi-negative";

    tr.innerHTML = `
      <td>${rankCell(index)}</td>
      <td>${traderCell(item)}</td>
      <td class="${roiClass}">${(item.roi || 0).toFixed(2)}%</td>
      <td class="${pnlClass}">$${pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
    `;
    body.appendChild(tr);
  });
}

function renderRoiRanking(data, prizeCount) {
  const body = document.getElementById("roi-ranking-body");
  const card = body.closest(".dashboard-card");

  const showPage = (page) => {
    renderRoiPage(body, data, page, prizeCount);
    buildPageTabs(card, data.length, page, showPage);
  };
  showPage(0);
}

function renderVolPage(body, data, page, prizeCount) {
  body.innerHTML = "";
  const start = page * INITIAL_DISPLAY_COUNT;
  const slice = data.slice(start, start + INITIAL_DISPLAY_COUNT);

  slice.forEach((item, i) => {
    const index = start + i;
    const tr = document.createElement("tr");
    tr.className = "animate-fade-in";
    tr.style.animationDelay = `${i * 0.03}s`;
    if (index < prizeCount) tr.classList.add("rank-prize");

    const vol = item.tradingVolume || 0;

    tr.innerHTML = `
      <td>${rankCell(index)}</td>
      <td>${traderCell(item)}</td>
      <td>$${vol.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
    `;
    body.appendChild(tr);
  });
}

function renderVolRanking(data, totalVolume, prizeCount) {
  const totalEl = document.getElementById("vol-total");
  if (totalEl && totalVolume != null) {
    totalEl.textContent = `$${totalVolume.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  const body = document.getElementById("vol-ranking-body");
  const card = body.closest(".dashboard-card");

  const showPage = (page) => {
    renderVolPage(body, data, page, prizeCount);
    buildPageTabs(card, data.length, page, showPage);
  };
  showPage(0);
}

// 起動時にリワードテーブルをデフォルト表示し、データを取得
window.onload = () => {
  renderRewardTables(null);
  fetchData();
};