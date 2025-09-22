#!/bin/bash

# -------------------------- 配置参数（修改为你的信息） --------------------------
LOCAL_DIST_PATH="./dist"          # 本地 dist 目录路径（如 /Users/yourname/project/dist）
SERVER_USER="root"                # 服务器登录用户（如 root）
SERVER_IP="47.108.203.64"         # 服务器公网 IP
SERVER_DIST_PATH="/root/h5editor/dist"  # 服务器存放 dist 的目录（已挂载到容器）
DOCKER_CONTAINER_NAME="nginx-h5"  # Docker 容器名称
SSH_KEY_PATH="$HOME/.ssh/my-ecs-key.pem"  # SSH 私钥路径（$HOME 自动解析家目录）
# -----------------------------------------------------------------------------

# 在上传前，确保 00PROMPT_GUIDE.MD 一并随 dist 发布（供线上读取）
if [ -f "./00PROMPT_GUIDE.MD" ]; then
  mkdir -p "$LOCAL_DIST_PATH" >/dev/null 2>&1
  cp -f "./00PROMPT_GUIDE.MD" "$LOCAL_DIST_PATH/00PROMPT_GUIDE.MD"
fi

# 检查本地 dist 目录是否存在
if [ ! -d "$LOCAL_DIST_PATH" ]; then
  echo "❌ 错误：本地 dist 目录不存在！路径：$LOCAL_DIST_PATH"
  exit 1
fi

# 检查 SSH 密钥是否存在
if [ ! -f "$SSH_KEY_PATH" ]; then
  echo "❌ 错误：SSH 密钥文件不存在！路径：$SSH_KEY_PATH"
  exit 1
fi

# -------------------------- 新增：上传前确认步骤 --------------------------
echo -e "\n⚠️ 即将执行以下操作："
echo "1. 将本地目录: $LOCAL_DIST_PATH"
echo "2. 上传到服务器: $SERVER_USER@$SERVER_IP:$SERVER_DIST_PATH"
echo "3. 覆盖服务器旧文件，并重启容器: $DOCKER_CONTAINER_NAME"
echo -e "\n请确认以上信息是否正确！"
read -p "是否继续？(输入 y 确认，其他键取消)：" confirm

# 如果用户输入不是 y/Y，则退出脚本
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "✅ 已取消操作，脚本退出。"
  exit 0
fi
# -----------------------------------------------------------------------------

# 步骤 2：通过 SCP 上传本地 dist 文件到服务器（覆盖旧文件）
echo -e "\n📤 正在上传 dist 目录到服务器 $SERVER_USER@$SERVER_IP..."
scp -i "$SSH_KEY_PATH" -r "$LOCAL_DIST_PATH"/* "$SERVER_USER@$SERVER_IP:$SERVER_DIST_PATH/"

# 检查上传是否成功
if [ $? -ne 0 ]; then
  echo "❌ 文件上传失败！请检查 SSH 密钥、服务器路径或网络。"
  exit 1
fi

# 步骤 3：SSH 连接服务器，重启 Docker 容器
echo -e "\n🔄 正在重启服务器上的 Docker 容器 $DOCKER_CONTAINER_NAME..."
ssh -i "$SSH_KEY_PATH" "$SERVER_USER@$SERVER_IP" "docker restart $DOCKER_CONTAINER_NAME && docker ps --filter 'name=$DOCKER_CONTAINER_NAME'"

# 检查重启是否成功
if [ $? -eq 0 ]; then
  echo -e "\n🎉 部署完成！访问 http://$SERVER_IP 查看最新效果。"
else
  echo -e "\n❌ 容器重启失败！请登录服务器检查：docker logs $DOCKER_CONTAINER_NAME"
fi
