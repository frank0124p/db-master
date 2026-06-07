# Tasks Index

## 執行順序

任務依序執行。每個任務對應一個 branch (`task/NN-description`) 和一個 PR。

| # | 任務 | Phase | 預估 | 前置 | 狀態 |
|---|---|---|---|---|---|
| 01 | Bootstrap Monorepo | 1 | 0.5d | — | ✅ |
| 02 | DB Schema & Migrations | 1 | 1d | 01 | ✅ |
| 03 | Schema & Table CRUD API | 1 | 1.5d | 02 | ✅ |
| 04 | Naming Dictionary API | 1 | 1d | 02 | ✅ |
| 05 | DDL Parser | 1 | 1.5d | 03 | ✅ |
| 06 | Frontend Shell | 1 | 0.5d | 01 | ✅ |
| 07 | Schema Builder UI | 1 | 2d | 03, 04, 06 | ✅ |
| 08 | NL → Schema Pipeline | 2 | 1.5d | 07 | ✅ |
| 09 | Skills Engine | 2 | 1d | 08 | ✅ |
| 10 | Streaming Responses | 2 | 0.5d | 08 | ✅ |
| 11 | Schema Versioning | 2 | 1d | 03 | ✅ |
| 12 | Schema Analysis | 2 | 1d | 09, 10, 11 | ✅ |
| 13 | DDL Export | 3 | 0.5d | 05 | ✅ |
| 14 | Naming Diff UI | 3 | 1d | 11, 07 | ✅ |
| 15 | E2E Tests | 3 | 1d | 14 | ✅ |

## 規則

- 狀態：⬜ 未開始 / 🔄 進行中 / ✅ 完成
- 每個 PR 的描述必須包含該任務的 acceptance criteria，並逐項勾選
- merge 前必須通過：typecheck + tests + lint
