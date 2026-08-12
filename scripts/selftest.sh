#!/usr/bin/env bash
# Foscen 统一质量门禁：本地与 CI 执行同一脚本。
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$1"; }
fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

step "工程基线"
required_files=(
  AGENTS.md
  CHANGELOG.md
  README.md
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  .node-version
  docs/README.md
  docs/architecture.md
  docs/security.md
  docs/roadmap.md
  docs/adr/README.md
  docs/adr/0001-electron-view-boundaries.md
  .github/pull_request_template.md
  .github/workflows/selftest.yml
)
for path in "${required_files[@]}"; do
  test -f "$path" || fail "缺少 $path"
done

step "工具链"
command -v node >/dev/null || fail "缺少 Node.js 24"
command -v pnpm >/dev/null || fail "缺少 pnpm 11.13.1"
test "$(node -p 'process.versions.node.split(".")[0]')" = "24" || fail "Node.js 必须为 24.x"
test "$(pnpm --version)" = "11.13.1" || fail "pnpm 必须为 11.13.1"

step "Shell 语法"
bash -n scripts/selftest.sh

step "依赖锁定"
pnpm install --frozen-lockfile

step "格式"
pnpm run format:check

step "Lint"
pnpm run lint

step "类型检查"
pnpm run typecheck

step "单元测试"
pnpm run test

step "生产构建"
pnpm run build

step "Electron 启动 smoke"
pnpm run smoke

printf '\nselftest OK\n'
