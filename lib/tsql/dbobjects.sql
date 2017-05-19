-- Normalizes schema information into a single result set; useful for understanding what structures and capabilities the target database supports.
WITH dbobjects ([dbobject]
	, [schema_name]
	, [kind]
	, [column]
	, [column_ordinal]
	, [column_type_name]
	, [max_length]
	, [precision]
	, [scale]
	, [is_nullable]
	, [is_identity]
	, [is_computed]
	, [is_output]
	, [default_value])
AS (SELECT t.name AS [dbobject]
	, SCHEMA_NAME(t.schema_id) AS [schema_name]
	, 'TABLE' AS [kind]
	, c.name AS [column]
	, c.column_id AS [column_ordinal]
	, tt.name AS [column_type]
	, c.max_length
	, c.precision
	, c.scale
	, c.is_nullable
    , (CASE c.is_identity WHEN 1 THEN c.is_identity ELSE c.is_rowguidcol END)
	, c.is_computed
	, 0
	, OBJECT_DEFINITION(c.default_object_id)
FROM sys.tables t
	JOIN sys.columns c ON c.object_id = t.object_id AND t.is_ms_shipped = 0
	JOIN sys.types tt ON c.system_type_id = tt.system_type_id and tt.system_type_id = tt.user_type_id
UNION
SELECT t.name AS [dbobject]
	, SCHEMA_NAME(t.schema_id) AS [schema_name]
	, 'VIEW' AS [kind]
	, c.name AS [column]
	, c.column_id AS [column_ordinal]
	, tt.name AS [column_type]
	, c.max_length
	, c.precision
	, c.scale
	, c.is_nullable
	, 0
	, 0
	, 0
	, NULL
FROM sys.views t
	JOIN sys.columns c ON c.object_id = t.object_id AND t.is_ms_shipped = 0
	JOIN sys.types tt ON c.system_type_id = tt.system_type_id and tt.system_type_id = tt.user_type_id
UNION
SELECT t.name AS [dbobject]
	, SCHEMA_NAME(t.schema_id) AS [schema_name]
	, 'STORED PROCEDURE' AS [kind]
	, c.name AS [column]
	, c.parameter_id AS [column_ordinal]
	, tt.name AS [column_type]
	, c.max_length
	, c.precision
	, c.scale
	, 1
	, 0
	, 0
	, c.is_output
	, CONVERT(VARCHAR(4000), c.default_value)
FROM sys.procedures t
	LEFT OUTER JOIN sys.parameters c ON c.object_id = t.object_id AND t.is_ms_shipped = 0
	LEFT OUTER JOIN sys.types tt ON c.system_type_id = tt.system_type_id and tt.system_type_id = tt.user_type_id
WHERE t.is_ms_shipped = 0)
SELECT * FROM dbobjects
ORDER BY [schema_name], [dbobject], [column_ordinal]
