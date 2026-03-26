import asyncio
import aiohttp
import json
import math
from datetime import datetime, timezone

EXPLORER_API_BASE = "https://explorer.elliot.ai/api"
LIGHTER_API_BASE = "https://mainnet.zklighter.elliot.ai/api/v1"

# 大会期間（UTC） ※後日設定
COMPETITION_START = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)
COMPETITION_END = datetime(2026, 4, 30, 0, 0, 0, tzinfo=timezone.utc)  # TODO: 正式日程を設定

PARTICIPANTS_FILE = "participants.json"


def load_participants() -> dict:
    """参加者データを読み込む"""
    try:
        with open(PARTICIPANTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_participants(data: dict) -> None:
    """参加者データを保存する"""
    with open(PARTICIPANTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


async def fetch_logs(session, address):
    """ページネーションで全ログを取得する（API上限: 100件/リクエスト）"""
    all_logs = []
    offset = 0
    limit = 100

    while True:
        url = f"{EXPLORER_API_BASE}/accounts/{address}/logs?offset={offset}&limit={limit}"
        async with session.get(url) as response:
            if response.status != 200:
                break
            batch = await response.json()
            if not batch:
                break
            all_logs.extend(batch)
            if len(batch) < limit:
                break
            offset += limit

    return all_logs


async def fetch_account_info(session, address) -> tuple[float, str]:
    """Lighter APIから現在の残高（collateral）とaccount_indexを取得する"""
    url = f"{LIGHTER_API_BASE}/account?by=l1_address&value={address}"
    async with session.get(url) as response:
        if response.status == 200:
            data = await response.json()
            accounts = data.get("accounts", [])
            if accounts:
                balance = float(accounts[0].get("collateral", 0))
                account_index = str(accounts[0].get("account_index", ""))
                return balance, account_index
    return 0.0, ""


async def get_stats_for_address(session, address, participant):
    """参加者の統計情報を取得する"""
    name = participant.get("name", address[:10])
    logs = await fetch_logs(session, address)
    current_balance, account_index = await fetch_account_info(session, address)

    # 初期残高が未登録の場合、現在残高をスナップショットとして記録（途中参加対応）
    if participant.get("initial_balance") is None:
        participant["initial_balance"] = current_balance
        participant["joined_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        print(f"Recorded initial balance for {name}: {current_balance}")

    initial_balance = participant["initial_balance"]
    joined_at = datetime.fromisoformat(
        participant["joined_at"].replace("Z", "+00:00")
    )

    # 集計の起点: 大会開始日時 or 参加日時の遅い方
    start_time = max(COMPETITION_START, joined_at)

    total_volume = 0
    total_deposits = 0
    total_withdrawals = 0

    # ログから指標を計算（大会期間内のみ）
    for log in logs:
        log_time = log.get("time", "")
        if log_time:
            dt = datetime.fromisoformat(log_time.replace("Z", "+00:00"))
            if dt < start_time or dt >= COMPETITION_END:
                continue

        pubdata_type = log.get("pubdata_type")
        data = log.get("pubdata", {})

        # --- Volume: 通常トレード ---
        if pubdata_type in ("Trade", "TradeWithFunding"):
            trade = data.get("trade_pubdata_with_funding") or data.get("trade_pubdata", {})
            price = float(trade.get("price", 0))
            size = float(trade.get("size", 0))
            total_volume += price * size

        # --- Volume: 清算トレード（通常Tradeと同じ構造） ---
        elif pubdata_type in ("LiquidationTrade", "LiquidationTradeWithFunding"):
            trade = data.get("trade_pubdata_with_funding") or data.get("trade_pubdata", {})
            price = float(trade.get("price", 0))
            size = float(trade.get("size", 0))
            total_volume += price * size

        # --- Volume: デレバレッジ（priceなし、quoteから算出） ---
        elif pubdata_type in ("Deleverage", "DeleverageWithFunding"):
            delev = data.get("deleverage_pubdata_with_funding") or data.get("deleverage_pubdata", {})
            quote = float(delev.get("quote", 0))
            size = float(delev.get("size", 0))
            # quote は内部精度のため、実際の金額に変換が必要な場合がある
            if quote > 0 and size > 0:
                total_volume += quote / 1e6  # quote の精度は要調整

        # --- 入金 ---
        elif pubdata_type in ("L1Deposit", "L1DepositV2"):
            deposit = data.get("l1_deposit_pubdata_v2") or data.get("l1_deposit_pubdata", {})
            amount = deposit.get("accepted_amount") or deposit.get("usdc_amount", 0)
            total_deposits += float(amount)

        # --- 出金 ---
        elif pubdata_type in ("Withdraw", "L1Withdraw", "L1WithdrawV2", "WithdrawV2"):
            withdraw = (
                data.get("l1_withdraw_pubdata_v2")
                or data.get("withdraw_pubdata_v2")
                or data.get("withdraw_pubdata", {})
            )
            amount = withdraw.get("amount") or withdraw.get("usdc_amount", 0)
            total_withdrawals += float(amount)

        # --- L2Transfer: 他アカウントへの送金は入出金扱い ---
        elif pubdata_type in ("L2Transfer", "L2TransferV2"):
            transfer = data.get("l2_transfer_pubdata_v2") or data.get("l2_transfer_pubdata", {})
            from_idx = str(transfer.get("from_account_index", ""))
            to_idx = str(transfer.get("to_account_index", ""))
            # 自アカウント内のルート移動（SPOT↔PERPS）はスキップ
            if from_idx != to_idx:
                amt = float(transfer.get("amount") or transfer.get("usdc_amount", 0))
                if from_idx == account_index:
                    total_withdrawals += amt  # 自分から送金 → 出金扱い
                elif to_idx == account_index:
                    total_deposits += amt  # 自分へ受領 → 入金扱い

    # PnL = 現在残高 - 初期残高 - 大会後入金 + 大会後出金
    pnl = current_balance - initial_balance - total_deposits + total_withdrawals

    # ROI = PnL / (初期残高 + 大会後入金) * 100
    invested = initial_balance + total_deposits
    roi = (pnl / invested * 100) if invested > 0 else 0

    # スコア計算: PnL * sqrt(Volume)
    score = pnl * math.sqrt(total_volume) if total_volume > 0 and pnl > 0 else 0

    return {
        "address": address,
        "displayName": name,
        "xAccount": participant.get("x_account", ""),
        "tradingVolume": total_volume,
        "roi": roi,
        "pnl": pnl,
        "score": score,
        "rank": 0,  # 後でソートして設定
    }


async def main():
    participants = load_participants()

    async with aiohttp.ClientSession() as session:
        tasks = [
            get_stats_for_address(session, addr, pdata)
            for addr, pdata in participants.items()
        ]
        results = await asyncio.gather(*tasks)

        # 新規参加者の初期残高が記録された場合に保存
        save_participants(participants)

        # スコアでソートしてランク付け
        results.sort(key=lambda x: x["score"], reverse=True)
        for i, res in enumerate(results):
            res["rank"] = i + 1

        out_data = {
            "meta": {
                "fetchedAtUTC": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "totalCount": len(results),
                "totalVolumeUSDT": sum(r["tradingVolume"] for r in results),
            },
            "participants": results,
        }

        # JSON保存
        with open("data.json", "w", encoding="utf-8") as f:
            json.dump(out_data, f, ensure_ascii=False, indent=2)

        print(f"Fetched data for {len(results)} participants.")


if __name__ == "__main__":
    asyncio.run(main())