import asyncio
import aiohttp
import json
import math
from datetime import datetime, timezone

EXPLORER_API_BASE = "https://explorer.elliot.ai/api"
LIGHTER_API_BASE = "https://mainnet.zklighter.elliot.ai/api/v1"

# 参加者リスト（L1アドレス: ユーザー名）
PARTICIPANTS = {
    "0x59dF4451216a08912ef7d7f5B882CB4e6644927e": "ExampleTrader",
    # 他の参加者をここに追加
}

async def fetch_logs(session, address):
    url = f"{EXPLORER_API_BASE}/accounts/{address}/logs"
    async with session.get(url) as response:
        if response.status == 200:
            return await response.json()
        return []

async def get_stats_for_address(session, address, name):
    logs = await fetch_logs(session, address)
    
    total_volume = 0
    total_deposits = 0
    total_withdrawals = 0
    
    # ログから指標を計算
    for log in logs:
        pubdata_type = log.get("pubdata_type")
        data = log.get("pubdata", {})
        
        if pubdata_type == "TradeWithFunding":
            trade = data.get("trade_pubdata_with_funding", {})
            price = float(trade.get("price", 0))
            size = float(trade.get("size", 0))
            total_volume += (price * size)
            
        elif pubdata_type == "L1DepositV2":
            deposit = data.get("l1_deposit_pubdata_v2", {})
            total_deposits += float(deposit.get("accepted_amount", 0))
            
        elif pubdata_type in ["L1Withdraw", "L1WithdrawV2"]:
            # 引出の形式は要確認ですが、一般的には入金と同様
            withdraw = data.get("l1_withdraw_pubdata_v2", {}) or data
            total_withdrawals += float(withdraw.get("amount", 0))

    # PnL の取得（Lighter API）
    # accountIndex が必要な場合があるため、一旦ログから取得を試みる
    account_index = None
    if logs:
        for log in logs:
            acc_idx = log.get("pubdata", {}).get("l1_deposit_pubdata_v2", {}).get("account_index")
            if acc_idx:
                account_index = acc_idx
                break
    
    pnl = 0
    if account_index:
        pnl_url = f"{LIGHTER_API_BASE}/pnl?account_index={account_index}"
        async with session.get(pnl_url) as resp:
            if resp.status == 200:
                pnl_data = await resp.json()
                # pnl_data の構造に合わせて調整
                pnl = float(pnl_data.get("pnl", 0))

    # ROI 計算: (PnL / Deposits) * 100
    roi = (pnl / total_deposits * 100) if total_deposits > 0 else 0
    
    # スコア計算: PnL * sqrt(Volume)
    score = pnl * math.sqrt(total_volume) if total_volume > 0 and pnl > 0 else 0

    return {
        "address": address,
        "displayName": name,
        "tradingVolume": total_volume,
        "roi": roi,
        "pnl": pnl,
        "score": score,
        "rank": 0 # 後でソートして設定
    }

async def main():
    async with aiohttp.ClientSession() as session:
        tasks = [get_stats_for_address(session, addr, name) for addr, name in PARTICIPANTS.items()]
        results = await asyncio.gather(*tasks)
        
        # スコアでソートしてランク付け
        results.sort(key=lambda x: x["score"], reverse=True)
        for i, res in enumerate(results):
            res["rank"] = i + 1
            
        out_data = {
            "meta": {
                "fetchedAtUTC": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "totalCount": len(results),
                "totalVolumeUSDT": sum(r["tradingVolume"] for r in results)
            },
            "participants": results
        }
        
        # JSON保存
        with open("data.json", "w", encoding="utf-8") as f:
            json.dump(out_data, f, ensure_ascii=False, indent=2)
            
        print(f"Fetched data for {len(results)} participants.")

if __name__ == "__main__":
    asyncio.run(main())
