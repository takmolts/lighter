import discord
import json
import asyncio
from datetime import datetime, timezone, timedelta
import os
from dotenv import load_dotenv

# .env ファイルから環境変数を読み込む
load_dotenv()

# ---------- 設定 ----------
TOKEN = os.getenv("DISCORD_TOKEN")
CHANNEL_ID = int(os.getenv("DISCORD_CHANNEL_ID") or 0)
DATA_FILE = "data.json"
JST = timezone(timedelta(hours=9))

# ---------- Embed整形ロジック (grvt_embed.pyを参考に調整) ----------

def _medal(i):
    return {1: "🥇", 2: "🥈", 3: "🥉"}.get(i, f"{i}.")

def _fmt_roi(roi):
    return f"{roi:.2f}%"

def _fmt_vol(vol):
    return f"${vol:,.2f}"

def build_lighter_embeds(data):
    meta = data.get("meta", {})
    participants = data.get("participants", [])
    
    total_vol = meta.get("totalVolumeUSDT", 0)
    updated_at = meta.get("fetchedAtUTC", "")
    
    # UTCからJSTへ変換
    try:
        dt_utc = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        updated_str = dt_utc.astimezone(JST).strftime("%Y-%m-%d %H:%M:%S (JST)")
    except:
        updated_str = updated_at

    # メインEmbed
    embed = discord.Embed(
        title="🏆 Wagyuu in Lighter ランキング速報",
        description=f"## 🟢 Total Volume ${total_vol:,.2f}",
        color=0x58a6ff,
        url="https://app.lighter.xyz/competition?id=commodity"
    )

    embed.add_field(name="👥 現在の参加者数", value=f"**{meta.get('totalCount', 0)}**人", inline=False)

    # ROIランキング (上位15名)
    top_roi = sorted(participants, key=lambda x: x["roi"], reverse=True)[:15]
    roi_lines = []
    for p in top_roi:
        line = f"{_medal(p['rank'])} {_fmt_roi(p['roi'])} - {p['displayName']}"
        if p['rank'] <= 3: line = f"**{line}**"
        roi_lines.append(line)
    embed.add_field(name="📈 ROIランキング (Top 15)", value="\n".join(roi_lines) or "データなし", inline=False)

    # 取引量ランキング (上位15名)
    top_vol = sorted(participants, key=lambda x: x["tradingVolume"], reverse=True)[:15]
    vol_lines = []
    for p in top_vol:
        line = f"{_medal(p['rank'])} {_fmt_vol(p['tradingVolume'])} - {p['displayName']}"
        if p['rank'] <= 3: line = f"**{line}**"
        vol_lines.append(line)
    embed.add_field(name="💰 Volumeランキング (Top 15)", value="\n".join(vol_lines) or "データなし", inline=False)

    embed.set_footer(text=f"checked: {updated_str}")
    return [embed]

# ---------- Bot本体 ----------

class LighterBot(discord.Client):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    async def setup_hook(self):
        self.bg_task = self.loop.create_task(self.periodic_update())

    async def on_ready(self):
        print(f'Logged in as {self.user} (ID: {self.user.id})')

    async def periodic_update(self):
        await self.wait_until_ready()
        channel = self.get_channel(CHANNEL_ID)
        
        while not self.is_closed():
            try:
                # データの読み込み
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # Embed作成と送信
                embeds = build_lighter_embeds(data)
                if channel:
                    await channel.send(embeds=embeds)
                    print(f"Sent update to Discord at {datetime.now()}")
                
            except Exception as e:
                print(f"Error in periodic_update: {e}")
            
            # 1時間ごとに実行（必要に応じて調整）
            await asyncio.sleep(3600)

async def run_bot(run_once=False):
    intents = discord.Intents.default()
    client = LighterBot(intents=intents)
    async with client:
        if run_once:
            # ワンショット実行：ログインしてメッセージを送って終了
            @client.event
            async def on_ready():
                print(f'Logged in as {client.user}')
                channel = client.get_channel(CHANNEL_ID)
                if channel:
                    with open(DATA_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    embeds = build_lighter_embeds(data)
                    await channel.send(embeds=embeds)
                    print("Message sent. Closing.")
                await client.close()
            
            await client.start(TOKEN)
        else:
            await client.start(TOKEN)

if __name__ == "__main__":
    # 環境変数 RUN_ONCE があれば1回だけ実行して終了する
    run_once_mode = os.getenv("RUN_ONCE", "false").lower() == "true"
    
    if not TOKEN:
        print("Error: DISCORD_TOKEN is not set.")
    else:
        asyncio.run(run_bot(run_once=run_once_mode))
