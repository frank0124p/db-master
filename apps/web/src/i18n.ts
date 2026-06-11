import { useStore } from "./store.js";

export type Locale = "zh" | "en";

const zh = {
  // ── Navigation ────────────────────────────────────────────────────────────
  "nav.editor":    "Schema 編輯器",
  "nav.dict":      "命名字典",
  "nav.versions":  "版本歷史",
  "nav.analysis":  "分析",
  "nav.er":        "ER 圖",
  "nav.wide":      "寬表",
  "nav.rules":     "規則 & Skills",
  "nav.datahub":   "DataHub",

  // ── Sidebar ───────────────────────────────────────────────────────────────
  "sidebar.schemas":    "Schemas",
  "sidebar.ai_gen":     "AI 生成",
  "sidebar.reload":     "重新載入 DDL",
  "sidebar.new_schema": "新建 Schema",

  // ── Form labels ───────────────────────────────────────────────────────────
  "form.schema_name":       "Schema 名稱",
  "form.schema_name_ph":    "e.g. MES Core v3",
  "form.description":       "說明",
  "form.description_ph":    "簡短說明此 Schema 的用途",
  "form.domain":            "領域",
  "form.semiconductor":     "半導體",
  "form.general":           "通用",
  "form.table_name":        "Table 名稱",
  "form.table_name_ph":     "e.g. lot_records",
  "form.table_comment":     "中文說明",
  "form.table_comment_ph":  "選填",
  "form.field_name":        "欄位名稱",
  "form.field_name_ph":     "e.g. equip_id",
  "form.data_type":         "資料型別",
  "form.default_value":     "預設值",
  "form.comment":           "備註",
  "form.optional":          "選填",
  "form.concept":           "概念名稱（中文）",
  "form.concept_ph":        "e.g. 設備識別碼",
  "form.std_name":          "標準英文名",
  "form.std_name_ph":       "e.g. equip_id",
  "form.aliases":           "別名（逗號分隔）",
  "form.aliases_ph":        "equipment_id, eqp_id",

  // ── Buttons ───────────────────────────────────────────────────────────────
  "btn.cancel":       "取消",
  "btn.create":       "建立",
  "btn.save":         "儲存",
  "btn.delete":       "刪除",
  "btn.edit":         "編輯",
  "btn.close":        "關閉",
  "btn.confirm":      "確認",
  "btn.add":          "新增",
  "btn.add_field":    "新增欄位",
  "btn.add_entry":    "新增詞條",
  "btn.export_ddl":   "↓ 匯出 DDL",
  "btn.save_version": "儲存版本",
  "btn.import_ddl":   "匯入 DDL",
  "btn.check_ddl":    "檢查 DDL",
  "btn.run_check":    "執行檢查",
  "btn.suggest_ai":   "✦ AI 建議",
  "btn.ai_generate":  "✦ 生成 Schema",
  "btn.generating":   "生成中…",
  "btn.checking":     "檢查中…",
  "btn.saving":       "儲存中…",
  "btn.importing":    "匯入中…",
  "btn.naming_check": "命名檢查",

  // ── Table / field column headers ──────────────────────────────────────────
  "col.field_name":  "欄位名稱",
  "col.type":        "型別",
  "col.nullable":    "可空",
  "col.default":     "預設值",
  "col.naming":      "命名",
  "col.comment":     "備註",
  "col.std_name":    "標準名稱",
  "col.concept":     "概念",
  "col.aliases":     "別名",
  "col.domain":      "領域",
  "col.description": "說明",
  "col.table_name":  "Table",
  "col.version":     "版本",
  "col.created_at":  "建立時間",

  // ── Status ────────────────────────────────────────────────────────────────
  "status.exact":   "完全符合",
  "status.alias":   "別名",
  "status.fuzzy":   "近似",
  "status.unknown": "未登錄",

  // ── Check / nullable ──────────────────────────────────────────────────────
  "nullable.yes": "可空",
  "nullable.no":  "非空",

  // ── Field flags ───────────────────────────────────────────────────────────
  "flag.nullable":     "允許空值",
  "flag.primary_key":  "主鍵",
  "flag.unique":       "唯一",

  // ── NamingPage ────────────────────────────────────────────────────────────
  "naming.title":           "命名字典",
  "naming.subtitle":        "半導體領域標準欄位名稱規範",
  "naming.tab_dict":        "字典條目",
  "naming.tab_check":       "欄位名稱檢查",
  "naming.search_ph":       "搜尋名稱或概念…",
  "naming.no_entries":      "尚無條目",
  "naming.new_entry":       "+ 新增條目",
  "naming.modal_new":       "新增命名條目",
  "naming.modal_edit":      "編輯命名條目",
  "naming.check_label":     "輸入欄位名稱進行檢查（每行一個或逗號分隔）",
  "naming.check_ph":        "equip_id\nlot_id\ncustomer_name",
  "naming.results_summary": "{n} 筆結果 — {exact} 完全符合 · {alias} 別名 · {fuzzy} 近似 · {unknown} 未登錄",

  // ── SchemasPage ───────────────────────────────────────────────────────────
  "schemas.page_title":     "Schemas",
  "schemas.page_subtitle":  "管理您的資料庫 Schema 設計",
  "schemas.new_schema_btn":  "+ 新建 Schema",
  "schemas.new_table":       "+ 新增 Table",
  "schemas.modal_new_table": "新增 Table",
  "schemas.modal_edit_field":"編輯欄位",
  "schemas.modal_add_field": "新增欄位",
  "schemas.modal_new_schema":"新建 Schema",
  "schemas.no_schemas":     "尚無 Schema",
  "schemas.naming_check":   "命名一致性檢查",
  "schemas.check_results":  "命名檢查結果",
  "schemas.create_table":   "建立",
  "schemas.all_good":       "全部符合命名規範",

  // ── AnalysisPage ──────────────────────────────────────────────────────────
  "analysis.run":         "執行分析",
  "analysis.running":     "分析中…",
  "analysis.select":      "請先選擇 Schema",
  "analysis.no_issues":   "未發現問題",
  "analysis.rule_issues": "規則問題",
  "analysis.ai_suggest":  "AI 建議",
  "analysis.score":       "品質分數",

  // ── VersionHistory ────────────────────────────────────────────────────────
  "versions.save":       "儲存版本",
  "versions.no_versions":"尚無版本記錄",
  "versions.snapshot":   "快照",
  "versions.diff":       "差異",
  "versions.tables":     "Tables",
  "versions.added":      "新增",
  "versions.removed":    "移除",
  "versions.modified":   "修改",

  // ── WideTable ─────────────────────────────────────────────────────────────
  "wide.preview":       "預覽",
  "wide.create":        "建立寬表",
  "wide.no_tables":     "尚無寬表",
  "wide.sources":       "來源 Tables",
  "wide.columns":       "輸出欄位",

  // ── ER Diagram ────────────────────────────────────────────────────────────
  "er.no_tables": "此 Schema 尚無 Table",

  // ── DDL Import ────────────────────────────────────────────────────────────
  "import.title":          "匯入 DDL",
  "import.paste_label":    "貼入 CREATE TABLE SQL",
  "import.dry_run_label":  "先執行 Dry Run 檢查",
  "import.check_btn":      "檢查 DDL",
  "import.import_btn":     "確認匯入",
  "import.no_result":      "點擊「檢查 DDL」查看結果",
  "import.tables_found":   "發現 {n} 張 Table",
  "import.errors":         "錯誤",
  "import.warnings":       "警告",
  "import.passed":         "通過",

  // ── Toasts ────────────────────────────────────────────────────────────────
  "toast.ddl_exported":   "✓ DDL 已匯出",
  "toast.version_saved":  "✓ 版本已儲存",
  "toast.schema_created": "✓ Schema 已建立",
  "toast.reloaded":       "✓ DDL 檔案與 Skills 已重新載入",
  "toast.reload_failed":  "⚠ 重新載入失敗",

  // ── Misc ──────────────────────────────────────────────────────────────────
  "misc.no_schema_selected": "請從左側選擇 Schema",
  "misc.loading":            "載入中…",
  "misc.optional":           "選填",
  "misc.delete_confirm":     "確定刪除「{name}」？",
  "misc.ai_output":          "LLM 輸出",
  "misc.generating_schema":  "正在生成 Schema…",

  // ── Governance Workflow ────────────────────────────────────────────────────
  "nav.knowledge":           "知識庫",
  "nav.import_classify":     "批次分類",
  "nav.compose":             "情境組裝",
  "nav.workspace":           "審核工作區",
  "nav.catalog":             "治理目錄",
  "nav.instances":           "工作流上線單",
  "nav.governance":          "治理工作流",

  "gov.status.pending":      "待審核",
  "gov.status.approved":     "已核准",
  "gov.status.rejected":     "已拒絕",
  "gov.status.draft":        "草稿",
  "gov.status.passed":       "通過",
  "gov.status.failed":       "未通過",
  "gov.status.published":    "已發佈",
  "gov.status.proposed":     "提案",
  "gov.status.imported":     "已匯入",
  "gov.status.classified":   "已分類",

  "gov.concept.approve":     "核准",
  "gov.concept.reject":      "拒絕",
  "gov.concept.add":         "新增概念卡",
  "gov.concept.extract":     "✦ LLM 抽取",

  "gov.doc.upload":          "上傳文件",
  "gov.doc.title":           "文件標題",
  "gov.doc.content":         "內容",

  "gov.batch.new":           "新增匯入批次",
  "gov.batch.classify":      "✦ 執行分類",
  "gov.batch.accept":        "接受",
  "gov.batch.override":      "改派",
  "gov.batch.accept_all":    "批次接受",

  "gov.compose.scenario":    "使用情境",
  "gov.compose.run":         "✦ 組裝寬表",
  "gov.compose.to_draft":    "轉入工作區",

  "gov.draft.validate":      "執行檢查",
  "gov.draft.publish":       "發佈",
  "gov.draft.save_version":  "存版本",
  "gov.draft.preview_sql":   "SQL 預覽",

  "gov.instance.new":        "新建上線單",
  "gov.instance.bypass":     "跳過此站",
  "gov.instance.reason":     "原因（必填）",
  "gov.instance.subject":    "資料主題",

  "gov.catalog.retrieve":    "語意檢索",
};

const en: Record<string, string> = {
  "nav.editor":    "Schema Editor",
  "nav.dict":      "Naming Dictionary",
  "nav.versions":  "Version History",
  "nav.analysis":  "Analysis",
  "nav.er":        "ER Diagram",
  "nav.wide":      "Wide Tables",
  "nav.rules":     "Rules & Skills",
  "nav.datahub":   "DataHub",

  "sidebar.schemas":    "Schemas",
  "sidebar.ai_gen":     "AI Generate",
  "sidebar.reload":     "Reload DDL",
  "sidebar.new_schema": "New Schema",

  "form.schema_name":       "Schema Name",
  "form.schema_name_ph":    "e.g. MES Core v3",
  "form.description":       "Description",
  "form.description_ph":    "Brief description of this schema",
  "form.domain":            "Domain",
  "form.semiconductor":     "Semiconductor",
  "form.general":           "General",
  "form.table_name":        "Table Name",
  "form.table_name_ph":     "e.g. lot_records",
  "form.table_comment":     "Comment",
  "form.table_comment_ph":  "optional",
  "form.field_name":        "Field Name",
  "form.field_name_ph":     "e.g. equip_id",
  "form.data_type":         "Data Type",
  "form.default_value":     "Default Value",
  "form.comment":           "Comment",
  "form.optional":          "optional",
  "form.concept":           "Concept",
  "form.concept_ph":        "e.g. Equipment ID",
  "form.std_name":          "Standard Name",
  "form.std_name_ph":       "e.g. equip_id",
  "form.aliases":           "Aliases (comma-separated)",
  "form.aliases_ph":        "equipment_id, eqp_id",

  "btn.cancel":       "Cancel",
  "btn.create":       "Create",
  "btn.save":         "Save",
  "btn.delete":       "Delete",
  "btn.edit":         "Edit",
  "btn.close":        "Close",
  "btn.confirm":      "Confirm",
  "btn.add":          "Add",
  "btn.add_field":    "Add Field",
  "btn.add_entry":    "Add Entry",
  "btn.export_ddl":   "↓ Export DDL",
  "btn.save_version": "Save Version",
  "btn.import_ddl":   "Import DDL",
  "btn.check_ddl":    "Check DDL",
  "btn.run_check":    "Run Check",
  "btn.suggest_ai":   "✦ AI Suggest",
  "btn.ai_generate":  "✦ Generate Schema",
  "btn.generating":   "Generating…",
  "btn.checking":     "Checking…",
  "btn.saving":       "Saving…",
  "btn.importing":    "Importing…",
  "btn.naming_check": "Naming Check",

  "col.field_name":  "Field Name",
  "col.type":        "Type",
  "col.nullable":    "Nullable",
  "col.default":     "Default",
  "col.naming":      "Naming",
  "col.comment":     "Comment",
  "col.std_name":    "Standard Name",
  "col.concept":     "Concept",
  "col.aliases":     "Aliases",
  "col.domain":      "Domain",
  "col.description": "Description",
  "col.table_name":  "Table",
  "col.version":     "Version",
  "col.created_at":  "Created At",

  "status.exact":   "Exact",
  "status.alias":   "Alias",
  "status.fuzzy":   "Fuzzy",
  "status.unknown": "Unknown",

  "nullable.yes": "NULL",
  "nullable.no":  "NOT NULL",

  "flag.nullable":     "Nullable",
  "flag.primary_key":  "Primary Key",
  "flag.unique":       "Unique",

  "naming.title":           "Naming Dictionary",
  "naming.subtitle":        "Standard field names for semiconductor domain",
  "naming.tab_dict":        "Dictionary",
  "naming.tab_check":       "Check Names",
  "naming.search_ph":       "Search by name or concept…",
  "naming.no_entries":      "No entries found",
  "naming.new_entry":       "+ New Entry",
  "naming.modal_new":       "New Naming Entry",
  "naming.modal_edit":      "Edit Entry",
  "naming.check_label":     "Enter field names to check (one per line or comma-separated)",
  "naming.check_ph":        "equip_id\nlot_id\ncustomer_name",
  "naming.results_summary": "{n} results — {exact} exact · {alias} alias · {fuzzy} fuzzy · {unknown} unknown",

  "schemas.page_title":      "Schemas",
  "schemas.page_subtitle":   "Manage your database schema designs",
  "schemas.new_schema_btn":  "+ New Schema",
  "schemas.new_table":       "+ New Table",
  "schemas.modal_new_table": "New Table",
  "schemas.modal_edit_field":"Edit Field",
  "schemas.modal_add_field": "Add Field",
  "schemas.modal_new_schema":"New Schema",
  "schemas.no_schemas":      "No schemas yet",
  "schemas.naming_check":    "Naming Check",
  "schemas.check_results":   "Naming Check Results",
  "schemas.create_table":    "Create",
  "schemas.all_good":        "All fields pass naming rules",

  "analysis.run":         "Run Analysis",
  "analysis.running":     "Analyzing…",
  "analysis.select":      "Select a schema first",
  "analysis.no_issues":   "No issues found",
  "analysis.rule_issues": "Rule Issues",
  "analysis.ai_suggest":  "AI Suggestions",
  "analysis.score":       "Quality Score",

  "versions.save":        "Save Version",
  "versions.no_versions": "No versions yet",
  "versions.snapshot":    "Snapshot",
  "versions.diff":        "Diff",
  "versions.tables":      "Tables",
  "versions.added":       "Added",
  "versions.removed":     "Removed",
  "versions.modified":    "Modified",

  "wide.preview":   "Preview",
  "wide.create":    "Create Wide Table",
  "wide.no_tables": "No wide tables yet",
  "wide.sources":   "Source Tables",
  "wide.columns":   "Output Columns",

  "er.no_tables": "No tables in this schema",

  "import.title":         "Import DDL",
  "import.paste_label":   "Paste CREATE TABLE SQL",
  "import.dry_run_label": "Dry run check first",
  "import.check_btn":     "Check DDL",
  "import.import_btn":    "Import",
  "import.no_result":     "Click \"Check DDL\" to preview",
  "import.tables_found":  "{n} table(s) found",
  "import.errors":        "Errors",
  "import.warnings":      "Warnings",
  "import.passed":        "Passed",

  // ── Governance Workflow ────────────────────────────────────────────────────
  "nav.knowledge":           "Knowledge Base",
  "nav.import_classify":     "Batch Classification",
  "nav.compose":             "Scenario Compose",
  "nav.workspace":           "Review Workspace",
  "nav.catalog":             "Governed Catalog",
  "nav.instances":           "Workflow Instances",
  "nav.governance":          "Governance Workflow",

  "gov.status.pending":      "Pending",
  "gov.status.approved":     "Approved",
  "gov.status.rejected":     "Rejected",
  "gov.status.draft":        "Draft",
  "gov.status.passed":       "Passed",
  "gov.status.failed":       "Failed",
  "gov.status.published":    "Published",
  "gov.status.proposed":     "Proposed",
  "gov.status.imported":     "Imported",
  "gov.status.classified":   "Classified",

  "gov.concept.approve":     "Approve",
  "gov.concept.reject":      "Reject",
  "gov.concept.add":         "Add Concept",
  "gov.concept.extract":     "✦ Extract with LLM",

  "gov.doc.upload":          "Upload Document",
  "gov.doc.title":           "Document Title",
  "gov.doc.content":         "Content",

  "gov.batch.new":           "New Import Batch",
  "gov.batch.classify":      "✦ Run Classification",
  "gov.batch.accept":        "Accept",
  "gov.batch.override":      "Override",
  "gov.batch.accept_all":    "Accept All",

  "gov.compose.scenario":    "Usage Scenario",
  "gov.compose.run":         "✦ Compose Wide Table",
  "gov.compose.to_draft":    "Send to Workspace",

  "gov.draft.validate":      "Run Validation",
  "gov.draft.publish":       "Publish",
  "gov.draft.save_version":  "Save Version",
  "gov.draft.preview_sql":   "SQL Preview",

  "gov.instance.new":        "New Instance",
  "gov.instance.bypass":     "Bypass Station",
  "gov.instance.reason":     "Reason (required)",
  "gov.instance.subject":    "Data Subject",

  "gov.catalog.retrieve":    "Semantic Search",

  "toast.ddl_exported":   "✓ DDL exported",
  "toast.version_saved":  "✓ Version saved",
  "toast.schema_created": "✓ Schema created",
  "toast.reloaded":       "✓ DDL files & Skills reloaded",
  "toast.reload_failed":  "⚠ Reload failed",

  "misc.no_schema_selected": "Select a schema from the sidebar",
  "misc.loading":            "Loading…",
  "misc.optional":           "optional",
  "misc.delete_confirm":     "Delete \"{name}\"?",
  "misc.ai_output":          "LLM Output",
  "misc.generating_schema":  "Generating schema…",
};

const DICTS: Record<Locale, Record<string, string>> = { zh, en };

export function useT() {
  const locale = useStore(s => s.locale);
  const dict = DICTS[locale];
  return function t(key: string, vars?: Record<string, string | number>): string {
    let val = dict[key] ?? DICTS["zh"][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars))
        val = val.replace(`{${k}}`, String(v));
    }
    return val;
  };
}
