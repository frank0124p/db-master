import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SchemaDetail, type Table, type Field } from "../api.js";
import { Btn, Card, Input, Modal, Spinner, EmptyState, Select, Badge } from "../components/ui.js";
import { useT } from "../i18n.js";

// ── Field row ────────────────────────────────────────────────────────────────
function FieldRow({ field, onDelete, onEdit }: { field: Field; onDelete: () => void; onEdit: () => void }) {
  const t = useT();
  return (
    <tr className="group border-t border-[var(--border)] hover:bg-[var(--bg-2)]">
      <td className="px-3 py-2 font-mono text-[var(--accent)] text-xs">
        {field.isPrimaryKey && <span className="mr-1 text-yellow-400" title="Primary Key">🔑</span>}
        {field.isUnique && !field.isPrimaryKey && <span className="mr-1 text-blue-400" title="Unique">⬡</span>}
        {field.name}
      </td>
      <td className="px-3 py-2 font-mono text-[var(--text-2)] text-xs">{field.dataType}</td>
      <td className="px-3 py-2 text-xs text-[var(--text-3)]">{field.nullable ? "NULL" : "NOT NULL"}</td>
      <td className="px-3 py-2 text-xs text-[var(--text-3)]">{field.defaultValue ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-[var(--text-3)]">{field.comment ?? ""}</td>
      <td className="px-3 py-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
        <Btn size="sm" variant="ghost" onClick={onEdit}>{t("btn.edit")}</Btn>
        <Btn size="sm" variant="danger" onClick={onDelete}>{t("btn.delete")}</Btn>
      </td>
    </tr>
  );
}

// ── Add / Edit Field Modal ───────────────────────────────────────────────────
const DATA_TYPES = ["BIGINT", "INT", "SMALLINT", "TINYINT", "DECIMAL(18,6)", "FLOAT", "DOUBLE",
  "VARCHAR(32)", "VARCHAR(64)", "VARCHAR(128)", "VARCHAR(255)", "TEXT", "MEDIUMTEXT",
  "BOOLEAN", "DATE", "DATETIME", "TIMESTAMP", "JSON"];

function FieldModal({
  tableId, field, onClose,
}: { tableId: number; field?: Field; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useT();
  const isEdit = !!field;
  const [form, setForm] = useState({
    name: field?.name ?? "",
    data_type: field?.dataType ?? "VARCHAR(64)",
    nullable: field?.nullable ?? true,
    default_value: field?.defaultValue ?? "",
    is_primary_key: field?.isPrimaryKey ?? false,
    is_unique: field?.isUnique ?? false,
    comment: field?.comment ?? "",
  });

  const save = useMutation<void, Error>({
    mutationFn: async () => {
      if (isEdit) {
        await api.fields.update(field!.id, {
          name: form.name, data_type: form.data_type, nullable: form.nullable,
          is_primary_key: form.is_primary_key, is_unique: form.is_unique,
          comment: form.comment || null,
        });
      } else {
        await api.fields.create(tableId, {
          ...form,
          default_value: form.default_value || null,
          comment: form.comment || null,
        });
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["schemas"] }); onClose(); },
  });

  return (
    <Modal title={isEdit ? t("schemas.modal_edit_field") : t("schemas.modal_add_field")} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.field_name")}</label>
          <Input placeholder={t("form.field_name_ph")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.data_type")}</label>
          <Select value={form.data_type} onChange={(e) => setForm({ ...form, data_type: e.target.value })}>
            {DATA_TYPES.map((dt) => <option key={dt}>{dt}</option>)}
          </Select>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer">
            <input type="checkbox" checked={form.nullable} onChange={(e) => setForm({ ...form, nullable: e.target.checked })} className="accent-[var(--accent)]" />
            {t("flag.nullable")}
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer">
            <input type="checkbox" checked={form.is_primary_key} onChange={(e) => setForm({ ...form, is_primary_key: e.target.checked })} className="accent-[var(--accent)]" />
            {t("flag.primary_key")}
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer">
            <input type="checkbox" checked={form.is_unique} onChange={(e) => setForm({ ...form, is_unique: e.target.checked })} className="accent-[var(--accent)]" />
            {t("flag.unique")}
          </label>
        </div>
        <div>
          <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.default_value")}</label>
          <Input placeholder={t("form.optional")} value={form.default_value} onChange={(e) => setForm({ ...form, default_value: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.comment")}</label>
          <Input placeholder={t("form.optional")} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </div>
        {save.error && <p className="text-xs text-[var(--red)]">{String(save.error)}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <Btn variant="ghost" onClick={onClose}>{t("btn.cancel")}</Btn>
          <Btn variant="primary" onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {save.isPending ? <Spinner /> : isEdit ? t("btn.save") : t("btn.add_field")}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Table Card ───────────────────────────────────────────────────────────────
function TableCard({ table, schemaId }: { table: Table; schemaId: number }) {
  const qc = useQueryClient();
  const t = useT();
  const [addField, setAddField] = useState(false);
  const [editField, setEditField] = useState<Field | null>(null);
  const [editName, setEditName] = useState(false);
  const [newName, setNewName] = useState(table.name);

  const deleteField = useMutation({
    mutationFn: (id: number) => api.fields.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["schemas"] }),
  });
  const deleteTable = useMutation({
    mutationFn: () => api.tables.delete(table.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["schemas"] }),
  });
  const renameTable = useMutation({
    mutationFn: () => api.tables.update(table.id, { name: newName }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["schemas"] }); setEditName(false); },
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-2)] border-b border-[var(--border)]">
        {editName ? (
          <div className="flex items-center gap-2 flex-1">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-7 text-xs" />
            <Btn size="sm" variant="primary" onClick={() => renameTable.mutate()} disabled={renameTable.isPending}>{t("btn.save")}</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setEditName(false)}>{t("btn.cancel")}</Btn>
          </div>
        ) : (
          <>
            <span className="font-mono text-sm font-semibold text-[var(--text-1)]">{table.name}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--text-3)]">{table.fields.length} {t("col.field_name")}</span>
              <Btn size="sm" variant="ghost" onClick={() => setEditName(true)}>✎</Btn>
              <Btn size="sm" variant="danger" onClick={() => { if (confirm(t("misc.delete_confirm", { name: table.name }))) deleteTable.mutate(); }}>✕</Btn>
            </div>
          </>
        )}
      </div>
      {table.fields.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[var(--text-3)] text-xs">
                <th className="px-3 py-1.5 font-normal">{t("col.field_name")}</th>
                <th className="px-3 py-1.5 font-normal">{t("col.type")}</th>
                <th className="px-3 py-1.5 font-normal">{t("col.nullable")}</th>
                <th className="px-3 py-1.5 font-normal">{t("col.default")}</th>
                <th className="px-3 py-1.5 font-normal">{t("col.comment")}</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {table.fields.map((f) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  onDelete={() => { if (confirm(t("misc.delete_confirm", { name: f.name }))) deleteField.mutate(f.id); }}
                  onEdit={() => setEditField(f)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-[var(--text-3)]">—</div>
      )}
      <div className="px-3 py-2 border-t border-[var(--border)]">
        <Btn size="sm" variant="ghost" onClick={() => setAddField(true)}>{t("btn.add_field")}</Btn>
      </div>
      {addField && <FieldModal tableId={table.id} onClose={() => setAddField(false)} />}
      {editField && <FieldModal tableId={table.id} field={editField} onClose={() => setEditField(null)} />}
    </Card>
  );
}

// ── Schema Detail ─────────────────────────────────────────────────────────────
function SchemaDetail({ schemaId, onBack }: { schemaId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const t = useT();
  const { data: schema, isLoading } = useQuery({
    queryKey: ["schemas", schemaId],
    queryFn: () => api.schemas.get(schemaId),
  });
  const [addTable, setAddTable] = useState(false);
  const [tableName, setTableName] = useState("");
  const [showCheck, setShowCheck] = useState(false);
  const [checkResults, setCheckResults] = useState<import("../api.js").TableNamingCheck[] | null>(null);

  const createTable = useMutation({
    mutationFn: () => api.tables.create(schemaId, { name: tableName }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["schemas"] }); setAddTable(false); setTableName(""); },
  });
  const runCheck = useMutation({
    mutationFn: () => api.schemas.namingCheck(schemaId),
    onSuccess: (data) => { setCheckResults(data); setShowCheck(true); },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!schema) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-[var(--text-3)] hover:text-[var(--text-1)] text-lg">←</button>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-1)]">{schema.name}</h1>
          {schema.description && <p className="text-sm text-[var(--text-3)] mt-0.5">{schema.description}</p>}
        </div>
        <div className="ml-auto flex gap-2">
          <Btn variant="ghost" onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
            {runCheck.isPending ? <Spinner /> : `⬡ ${t("schemas.naming_check")}`}
          </Btn>
          <Btn variant="default" onClick={() => setAddTable(true)}>{t("schemas.new_table")}</Btn>
        </div>
      </div>

      {schema.tables.length === 0
        ? <EmptyState icon="⬡" message={t("schemas.no_schemas")} />
        : <div className="flex flex-col gap-4">
            {schema.tables.map((t) => <TableCard key={t.id} table={t} schemaId={schemaId} />)}
          </div>
      }

      {addTable && (
        <Modal title={t("schemas.modal_new_table")} onClose={() => setAddTable(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.table_name")}</label>
              <Input
                placeholder={t("form.table_name_ph")}
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTable.mutate()}
              />
            </div>
            {createTable.error && <p className="text-xs text-[var(--red)]">{String(createTable.error)}</p>}
            <div className="flex justify-end gap-2 mt-1">
              <Btn variant="ghost" onClick={() => setAddTable(false)}>{t("btn.cancel")}</Btn>
              <Btn variant="primary" onClick={() => createTable.mutate()} disabled={!tableName || createTable.isPending}>
                {createTable.isPending ? <Spinner /> : t("schemas.create_table")}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showCheck && checkResults && (
        <Modal title={t("schemas.check_results")} onClose={() => setShowCheck(false)}>
          <div className="max-h-96 overflow-y-auto flex flex-col gap-4">
            {checkResults.map((t) => (
              <div key={t.tableId}>
                <div className="text-xs font-mono font-semibold text-[var(--text-2)] mb-2">{t.tableName}</div>
                <div className="flex flex-col gap-1">
                  {t.fields.map((f) => (
                    <div key={f.fieldName} className="flex items-center justify-between">
                      <span className="font-mono text-xs text-[var(--text-1)]">{f.fieldName}</span>
                      <div className="flex items-center gap-2">
                        {f.result.stdName && f.result.status !== "exact" && (
                          <span className="text-xs text-[var(--text-3)]">→ {f.result.stdName}</span>
                        )}
                        <Badge status={f.result.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Schemas List ──────────────────────────────────────────────────────────────
export function SchemasPage() {
  const qc = useQueryClient();
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data: schemas, isLoading } = useQuery({
    queryKey: ["schemas"],
    queryFn: api.schemas.list,
  });

  const create = useMutation({
    mutationFn: () => api.schemas.create({ name: form.name, ...(form.description ? { description: form.description } : {}) }),
    onSuccess: (s) => { void qc.invalidateQueries({ queryKey: ["schemas"] }); setShowCreate(false); setForm({ name: "", description: "" }); setSelected(s.id); },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.schemas.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["schemas"] }),
  });

  if (selected !== null) {
    return <SchemaDetail schemaId={selected} onBack={() => { setSelected(null); void qc.invalidateQueries({ queryKey: ["schemas"] }); }} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t("schemas.page_title")}</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">{t("schemas.page_subtitle")}</p>
        </div>
        <Btn variant="primary" onClick={() => setShowCreate(true)}>{t("schemas.new_schema_btn")}</Btn>
      </div>

      {isLoading && <div className="flex justify-center py-16"><Spinner /></div>}
      {!isLoading && schemas?.length === 0 && <EmptyState icon="⬡" message={t("schemas.no_schemas")} />}

      <div className="grid gap-3">
        {schemas?.map((s) => (
          <Card key={s.id} className="flex items-center justify-between px-4 py-3 hover:border-[var(--accent-dim)] transition-colors cursor-pointer group"
            onClick={() => setSelected(s.id)}>
            <div>
              <div className="font-semibold text-[var(--text-1)] group-hover:text-[var(--accent)] transition-colors">{s.name}</div>
              {s.description && <div className="text-xs text-[var(--text-3)] mt-0.5">{s.description}</div>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-3)] font-mono">{s.domain}</span>
              <Btn size="sm" variant="danger"
                onClick={(e) => { e.stopPropagation(); if (confirm(t("misc.delete_confirm", { name: s.name }))) del.mutate(s.id); }}>
                ✕
              </Btn>
            </div>
          </Card>
        ))}
      </div>

      {showCreate && (
        <Modal title={t("schemas.modal_new_schema")} onClose={() => setShowCreate(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.schema_name")}</label>
              <Input placeholder={t("form.schema_name_ph")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && create.mutate()} />
            </div>
            <div>
              <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.description")}（{t("form.optional")}）</label>
              <Input placeholder={t("form.description_ph")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {create.error && <p className="text-xs text-[var(--red)]">{String(create.error)}</p>}
            <div className="flex justify-end gap-2 mt-1">
              <Btn variant="ghost" onClick={() => setShowCreate(false)}>{t("btn.cancel")}</Btn>
              <Btn variant="primary" onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
                {create.isPending ? <Spinner /> : t("btn.create")}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
