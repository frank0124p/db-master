Generate a concise Traditional Chinese description (COMMENT) for a database field.

Context:
- Table: {{table_name}} ({{table_comment}})
- Field: {{field_name}} ({{field_type}})
- Domain: {{domain}}

Rules:
- Maximum 30 Chinese characters
- Be specific about what this field stores
- Use terms appropriate for semiconductor manufacturing if domain is "semiconductor"
- Do not start with "儲存" or "用來" — just state what it is directly

Respond with only the description text, no punctuation at the end.
