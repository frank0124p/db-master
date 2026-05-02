# Task 06: Frontend Shell

**Phase**: 1
**Effort**: ~0.5d
**Depends on**: 01
**Branch**: `task/06-frontend-shell`

## Goal

建立前端的基礎結構：Tailwind CSS、全域 layout、routing、TanStack Query 初始化。完成後有一個可以導覽的空殼 App，還沒有真正的功能頁面。

## Approach

1. **Tailwind CSS**：安裝 `tailwindcss` + `@tailwindcss/vite`，設定 CSS variables 作為 design token：
   ```css
   :root {
     --bg-1: #0f0f11;    /* 最暗背景 */
     --bg-2: #1a1a1f;    /* 卡片背景 */
     --bg-3: #25252d;    /* hover/active */
     --text-1: #e8e8f0;  /* 主文字 */
     --text-2: #9999aa;  /* 次要文字 */
     --accent: #6b8cff;  /* 強調色（藍紫，科技感）*/
     --success: #4ade80;
     --warning: #fbbf24;
     --error: #f87171;
     --border: #2e2e3a;
   }
   ```

2. **Layout**：
   - 左側 sidebar（固定寬度 220px）：Schema 列表 + 導覽
   - 主區域：router outlet
   - 頂部 header（選用，輕量）

3. **Routing**（React Router v6）：
   - `/` → redirect to `/schemas`
   - `/schemas` → Schema 列表頁
   - `/schemas/:id` → Schema 詳細頁（task 07 實作內容）
   - `/schemas/:id/analyze` → Schema 分析頁（task 12）
   - `/naming-dictionary` → 命名字典管理頁（task 07）

4. **TanStack Query**：`QueryClientProvider` 在 root，設定 `staleTime: 30_000`

5. **Toast 系統**：用 `react-hot-toast`（輕量），在 root 掛載 `<Toaster />`

## Acceptance Criteria

- [ ] `pnpm dev` 起來，瀏覽器開 `localhost:5173` 顯示 layout，sidebar 顯示「Schema Studio」
- [ ] 路由切換正常（可以用 Link 點選 sidebar 項目）
- [ ] Tailwind CSS 生效，CSS variables 設定好
- [ ] TanStack Query 初始化，dev tools 可見（開發環境）
- [ ] Toast 可以觸發（簡單測試用按鈕即可，task 07 再移除）
- [ ] `pnpm typecheck` + `pnpm lint` 通過

## 風格原則

- 深色主題（半導體廠的監控系統普遍深色）
- 扁平、功能性，不需要 fancy 動畫
- 數字和 code 用等寬字型（`font-mono`）
