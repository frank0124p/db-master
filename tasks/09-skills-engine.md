# Task 09: Skills Engine

**Phase**: 2
**Effort**: ~1d
**Depends on**: 08
**Branch**: `task/09-skills-engine`

## Goal

在 server 啟動時載入 `skills/` 目錄下的所有 SKILL.md 檔案，並在 LLM 呼叫時注入相關 skill 內容。開發模式下檔案變更時自動重載。

## Approach

1. **Skill loader**（`apps/api/src/services/skills.ts`）：
   - Server 啟動時掃描 `skills/**/SKILL.md`
   - 解析 frontmatter（`name`, `domain`, `tags`）
   - 存在 memory 中（`Map<string, Skill>`）
   - 開發模式：用 `chokidar` watch `skills/` 目錄，檔案變更時重載

2. **Skill 選擇邏輯**：根據 Schema 的 `domain` 自動選擇對應 skills
   - `domain: semiconductor` → 載入 `schema-design` + `naming-dictionary` + `semiconductor` skills
   - `domain: general` → 只載入 `schema-design` + `naming-dictionary`

3. **注入格式**：Skills 以 XML tags 注入 system prompt：
   ```
   <skill name="semiconductor-naming">
   ...SKILL.md 內容...
   </skill>
   ```

## Acceptance Criteria

- [ ] Server 啟動時正確載入所有 SKILL.md
- [ ] 修改 SKILL.md 後不需重啟 server（dev 模式）
- [ ] `POST /api/v1/llm/generate` 呼叫時，LLM 收到的 prompt 包含對應 skill 內容
- [ ] 新增測試：skills loader 正確解析 frontmatter 和內容
- [ ] `pnpm typecheck` 通過
