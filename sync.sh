#!/bin/bash
# 琺瑯壁板報價系統 - 每日自動同步腳本
# 執行時間：每天 03:00

cd /Users/alex_bot_0223/.openclaw/workspace/enamel-quote-system

# 檢查是否有遠端更新
git fetch origin

# 如果有更新則 pull 並 push
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "發現新版本，正在同步..."
    git pull origin main
    git push origin main
    echo "同步完成！"
else
    echo "已是最新版本，無需同步。"
fi
