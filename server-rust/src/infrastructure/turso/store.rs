use super::{
    codec::{decode, encode, Value},
    schema::{validate_schema, Model, Schema},
};
use crate::application::{Error, Page, Result};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex as StateMutex,
    },
};
use tokio::sync::{Mutex, MutexGuard};
use turso::{params_from_iter, Connection, Value as SqlValue};

pub(super) type Record = BTreeMap<String, Value>;

pub(super) struct Scope {
    pub active: AtomicBool,
    pub gate: Mutex<()>,
}

pub(super) struct Shared {
    pub conn: Connection,
    pub gate: Mutex<()>,
    pub cleanup: StateMutex<Option<Arc<Scope>>>,
}

pub(super) struct Store {
    pub shared: Arc<Shared>,
    pub schema: Arc<Schema>,
    pub scope: Option<Arc<Scope>>,
}

pub(super) fn storage_error(error: turso::Error) -> Error {
    Error::Storage(error.to_string())
}

fn quote(name: &str) -> String {
    format!("\"{name}\"")
}

impl Store {
    pub fn new(conn: Connection, schema: Schema) -> Result<Self> {
        Ok(Self {
            shared: Arc::new(Shared {
                conn,
                gate: Mutex::new(()),
                cleanup: StateMutex::new(None),
            }),
            schema: Arc::new(validate_schema(schema)?),
            scope: None,
        })
    }

    pub async fn enter(&self) -> Result<MutexGuard<'_, ()>> {
        if let Some(scope) = &self.scope {
            let guard = scope.gate.lock().await;
            if !scope.active.load(Ordering::SeqCst) {
                return Err(Error::ClosedScope);
            }
            return Ok(guard);
        }
        let guard = self.shared.gate.lock().await;
        let pending = self
            .shared
            .cleanup
            .lock()
            .map_err(|_| Error::InvalidInput("transaction cleanup lock poisoned"))?
            .take();
        if let Some(scope) = pending {
            // Drain a child operation before the SDK rolls back a dropped transaction.
            let _drain = scope.gate.lock().await;
        }
        Ok(guard)
    }

    fn model(&self, name: &str) -> Result<&Model> {
        self.schema
            .get(name)
            .ok_or(Error::InvalidInput("unknown model"))
    }

    fn values(model: &Model, record: &Record) -> Result<(Vec<String>, Vec<SqlValue>)> {
        let mut columns = Vec::new();
        let mut args = Vec::new();
        for (key, value) in record {
            let field = model
                .fields
                .get(key)
                .ok_or(Error::InvalidInput("unknown field"))?;
            columns.push(quote(&field.column));
            args.push(encode(field, value)?);
        }
        Ok((columns, args))
    }

    pub async fn create(&self, name: &str, record: Record) -> Result<()> {
        let model = self.model(name)?;
        if !matches!(record.get(&model.id), Some(Value::Text(id)) if !id.is_empty()) {
            return Err(Error::InvalidInput("missing string primary key"));
        }
        let (columns, args) = Self::values(model, &record)?;
        let marks = vec!["?"; args.len()].join(", ");
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({marks})",
            quote(&model.table),
            columns.join(", ")
        );
        let _guard = self.enter().await?;
        self.shared
            .conn
            .execute(&sql, params_from_iter(args))
            .await
            .map_err(storage_error)?;
        Ok(())
    }

    pub async fn get(&self, name: &str, id: &str) -> Result<Record> {
        if id.is_empty() {
            return Err(Error::InvalidInput("empty primary key"));
        }
        let model = self.model(name)?;
        self.find(
            name,
            Record::from([(model.id.clone(), Value::Text(id.into()))]),
            Page {
                limit: 1,
                offset: 0,
            },
        )
        .await?
        .into_iter()
        .next()
        .ok_or(Error::NotFound)
    }

    pub async fn find(&self, name: &str, filter: Record, page: Page) -> Result<Vec<Record>> {
        let (limit, offset) = page.bounds()?;
        let model = self.model(name)?;
        let columns: Vec<_> = model
            .fields
            .values()
            .map(|field| quote(&field.column))
            .collect();
        let mut conditions = Vec::new();
        let mut args = Vec::new();
        for (logical, value) in filter {
            let field = model
                .fields
                .get(&logical)
                .ok_or(Error::InvalidInput("unknown filter field"))?;
            let value = encode(field, &value)?;
            if value == SqlValue::Null {
                conditions.push(format!("{} IS NULL", quote(&field.column)));
            } else {
                conditions.push(format!("{} = ?", quote(&field.column)));
                args.push(value);
            }
        }
        let mut sql = format!("SELECT {} FROM {}", columns.join(", "), quote(&model.table));
        if !conditions.is_empty() {
            sql.push_str(&format!(" WHERE {}", conditions.join(" AND ")));
        }
        sql.push_str(&format!(
            " ORDER BY {} ASC LIMIT ? OFFSET ?",
            quote(&model.fields[&model.id].column)
        ));
        args.extend([SqlValue::Integer(limit), SqlValue::Integer(offset)]);
        let _guard = self.enter().await?;
        let mut rows = self
            .shared
            .conn
            .query(&sql, params_from_iter(args))
            .await
            .map_err(storage_error)?;
        let mut result = Vec::new();
        while let Some(row) = rows.next().await.map_err(storage_error)? {
            let mut record = Record::new();
            for (index, (logical, field)) in model.fields.iter().enumerate() {
                record.insert(
                    logical.clone(),
                    decode(field, row.get_value(index).map_err(storage_error)?)?,
                );
            }
            result.push(record);
        }
        Ok(result)
    }

    pub async fn update(&self, name: &str, id: &str, patch: Record) -> Result<()> {
        if id.is_empty() {
            return Err(Error::InvalidInput("empty primary key"));
        }
        let model = self.model(name)?;
        if patch.is_empty() {
            return Err(Error::InvalidInput("empty patch"));
        }
        if patch.contains_key(&model.id) {
            return Err(Error::InvalidInput("primary key is immutable"));
        }
        let (columns, mut args) = Self::values(model, &patch)?;
        let assignments: Vec<_> = columns
            .iter()
            .map(|column| format!("{column} = ?"))
            .collect();
        args.push(SqlValue::Text(id.into()));
        let sql = format!(
            "UPDATE {} SET {} WHERE {} = ?",
            quote(&model.table),
            assignments.join(", "),
            quote(&model.fields[&model.id].column)
        );
        let _guard = self.enter().await?;
        let affected = self
            .shared
            .conn
            .execute(&sql, params_from_iter(args))
            .await
            .map_err(storage_error)?;
        if affected == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }

    pub async fn delete(&self, name: &str, id: &str) -> Result<()> {
        if id.is_empty() {
            return Err(Error::InvalidInput("empty primary key"));
        }
        let model = self.model(name)?;
        let sql = format!(
            "DELETE FROM {} WHERE {} = ?",
            quote(&model.table),
            quote(&model.fields[&model.id].column)
        );
        let _guard = self.enter().await?;
        let affected = self
            .shared
            .conn
            .execute(&sql, [id])
            .await
            .map_err(storage_error)?;
        if affected == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::{Field, Kind, Model};
    use super::*;

    async fn fixture() -> Store {
        let db = turso::Builder::new_local(":memory:").build().await.unwrap();
        let conn = db.connect().unwrap();
        conn.execute("CREATE TABLE auth_user (user_id TEXT PRIMARY KEY, display_name TEXT DEFAULT 'fictional-default')", ()).await.unwrap();
        let schema = Schema::from([(
            "user".into(),
            Model {
                table: "auth_user".into(),
                id: "id".into(),
                fields: BTreeMap::from([
                    (
                        "id".into(),
                        Field {
                            column: "user_id".into(),
                            kind: Kind::String,
                            nullable: false,
                        },
                    ),
                    (
                        "name".into(),
                        Field {
                            column: "display_name".into(),
                            kind: Kind::String,
                            nullable: true,
                        },
                    ),
                ]),
            },
        )]);
        Store::new(conn, schema).unwrap()
    }

    fn record(id: &str, name: Option<Value>) -> Record {
        let mut record = Record::from([("id".into(), Value::Text(id.into()))]);
        if let Some(name) = name {
            record.insert("name".into(), name);
        }
        record
    }

    #[tokio::test]
    async fn actual_engine_crud_preserves_defaults_and_reports_missing_rows() {
        let store = fixture().await;
        store.create("user", record("b", None)).await.unwrap();
        let row = store.get("user", "b").await.unwrap();
        assert_eq!(row["name"], Value::Text("fictional-default".into()));
        assert!(store.create("user", record("b", None)).await.is_err());
        store
            .update(
                "user",
                "b",
                Record::from([("name".into(), Value::Text("updated".into()))]),
            )
            .await
            .unwrap();
        assert_eq!(
            store.get("user", "b").await.unwrap()["name"],
            Value::Text("updated".into())
        );
        store.delete("user", "b").await.unwrap();
        assert_eq!(store.get("user", "b").await.unwrap_err(), Error::NotFound);
        assert_eq!(
            store
                .update("user", "b", Record::from([("name".into(), Value::Null)]))
                .await
                .unwrap_err(),
            Error::NotFound
        );
        assert_eq!(
            store.delete("user", "b").await.unwrap_err(),
            Error::NotFound
        );
    }

    #[tokio::test]
    async fn actual_engine_values_are_inert_and_null_filters_and_id_order_are_preserved() {
        let store = fixture().await;
        let attack = "x'); DROP TABLE auth_user; --";
        for (id, name) in [
            ("c", Value::Null),
            ("a", Value::Text(attack.into())),
            ("b", Value::Text(attack.into())),
        ] {
            store.create("user", record(id, Some(name))).await.unwrap();
        }
        let rows = store
            .find(
                "user",
                Record::new(),
                Page {
                    limit: 1,
                    offset: 1,
                },
            )
            .await
            .unwrap();
        assert_eq!(rows[0]["id"], Value::Text("b".into()));
        let nulls = store
            .find(
                "user",
                Record::from([("name".into(), Value::Null)]),
                Page::default(),
            )
            .await
            .unwrap();
        assert_eq!(nulls.len(), 1);
        let matches = store
            .find(
                "user",
                Record::from([("name".into(), Value::Text(attack.into()))]),
                Page::default(),
            )
            .await
            .unwrap();
        assert_eq!(matches.len(), 2);
        assert_eq!(
            store
                .find("user", Record::new(), Page::default())
                .await
                .unwrap()
                .len(),
            3
        );
        assert!(store
            .find(
                "user",
                Record::from([("id".into(), Value::Text("absent".into()))]),
                Page::default()
            )
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn rejects_invalid_writes_filters_ids_and_pages_before_sql() {
        let mut store = fixture().await;
        assert!(store.create("missing", record("a", None)).await.is_err());
        assert!(store.create("user", record("", None)).await.is_err());
        assert!(store
            .create("user", Record::from([("id".into(), Value::Null)]))
            .await
            .is_err());
        assert!(store
            .create(
                "user",
                Record::from([
                    ("id".into(), Value::Text("a".into())),
                    ("unknown".into(), Value::Text("x".into()))
                ])
            )
            .await
            .is_err());
        assert!(store.update("user", "a", Record::new()).await.is_err());
        assert!(store.update("user", "a", record("b", None)).await.is_err());
        assert!(store.delete("user", "").await.is_err());
        assert!(store.get("user", "").await.is_err());
        assert!(store
            .find(
                "user",
                Record::new(),
                Page {
                    limit: -1,
                    offset: 0
                }
            )
            .await
            .is_err());
        assert!(store
            .find(
                "user",
                Record::new(),
                Page {
                    limit: 1,
                    offset: -1
                }
            )
            .await
            .is_err());
        assert!(store
            .find(
                "user",
                Record::from([("unknown".into(), Value::Null)]),
                Page::default()
            )
            .await
            .is_err());
        store.create("user", record("a", None)).await.unwrap();
        Arc::get_mut(&mut store.schema)
            .unwrap()
            .get_mut("user")
            .unwrap()
            .fields
            .get_mut("name")
            .unwrap()
            .kind = Kind::Boolean;
        assert!(
            store.get("user", "a").await.is_err(),
            "malformed stored type must not be coerced"
        );
    }

    #[tokio::test]
    async fn default_and_capped_reads_are_bounded_on_the_actual_engine() {
        let store = fixture().await;
        for i in 0..1002 {
            store
                .create("user", record(&format!("{i:04}"), None))
                .await
                .unwrap();
        }
        assert_eq!(
            store
                .find("user", Record::new(), Page::default())
                .await
                .unwrap()
                .len(),
            100
        );
        assert_eq!(
            store
                .find(
                    "user",
                    Record::new(),
                    Page {
                        limit: 2000,
                        offset: 0
                    }
                )
                .await
                .unwrap()
                .len(),
            1000
        );
    }
}
