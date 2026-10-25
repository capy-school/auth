use crate::application::{Error, Result};
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    String,
    Boolean,
    Date,
    Number,
    Json,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    pub column: String,
    pub kind: Kind,
    pub nullable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Model {
    pub table: String,
    pub id: String,
    pub fields: BTreeMap<String, Field>,
}

pub type Schema = BTreeMap<String, Model>;

fn identifier(value: &str) -> bool {
    let mut bytes = value.bytes();
    matches!(bytes.next(), Some(b'a'..=b'z' | b'A'..=b'Z' | b'_'))
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

pub fn validate_schema(schema: Schema) -> Result<Schema> {
    if schema.is_empty() {
        return Err(Error::InvalidInput("empty schema"));
    }
    let mut tables = HashSet::new();
    for (name, model) in &schema {
        if !identifier(name) || !identifier(&model.table) {
            return Err(Error::InvalidInput("invalid model or table identifier"));
        }
        if !tables.insert(model.table.to_ascii_lowercase()) {
            return Err(Error::InvalidInput("duplicate table mapping"));
        }
        let primary = model
            .fields
            .get(&model.id)
            .ok_or(Error::InvalidInput("missing primary key"))?;
        if primary.kind != Kind::String || primary.nullable {
            return Err(Error::InvalidInput(
                "primary key must be a nonnullable string",
            ));
        }
        let mut columns = HashSet::new();
        for (logical, field) in &model.fields {
            if !identifier(logical) || !identifier(&field.column) {
                return Err(Error::InvalidInput("invalid field or column identifier"));
            }
            if !columns.insert(field.column.to_ascii_lowercase()) {
                return Err(Error::InvalidInput("duplicate column mapping"));
            }
        }
    }
    Ok(schema)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn fixture() -> Schema {
        BTreeMap::from([(
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
        )])
    }

    #[test]
    fn validates_owned_metadata_without_aliasing_the_caller() {
        let mut original = fixture();
        let validated = validate_schema(original.clone()).unwrap();
        original
            .get_mut("user")
            .unwrap()
            .fields
            .get_mut("id")
            .unwrap()
            .column = "changed".into();
        original.clear();
        assert_eq!(validated["user"].fields["id"].column, "user_id");
    }

    #[test]
    fn rejects_every_invalid_mapping_before_sql() {
        type Mutation = fn(&mut Schema);
        let cases: &[(&str, Mutation)] = &[
            ("unsafe table", |s| {
                s.get_mut("user").unwrap().table = "user\"; DROP TABLE user;--".into()
            }),
            ("unsafe column", |s| {
                s.get_mut("user")
                    .unwrap()
                    .fields
                    .get_mut("name")
                    .unwrap()
                    .column = "name;DELETE".into()
            }),
            ("unsafe model", |s| {
                s.insert("bad model".into(), s["user"].clone());
            }),
            ("unsafe logical field", |s| {
                s.get_mut("user").unwrap().fields.insert(
                    "bad field".into(),
                    Field {
                        column: "valid".into(),
                        kind: Kind::String,
                        nullable: true,
                    },
                );
            }),
            ("duplicate table", |s| {
                let mut model = s["user"].clone();
                model.table = "AUTH_USER".into();
                s.insert("other".into(), model);
            }),
            ("duplicate column", |s| {
                s.get_mut("user")
                    .unwrap()
                    .fields
                    .get_mut("name")
                    .unwrap()
                    .column = "USER_ID".into()
            }),
            ("missing primary key", |s| {
                s.get_mut("user").unwrap().id = "missing".into()
            }),
            ("nullable primary key", |s| {
                s.get_mut("user")
                    .unwrap()
                    .fields
                    .get_mut("id")
                    .unwrap()
                    .nullable = true
            }),
            ("numeric primary key", |s| {
                s.get_mut("user")
                    .unwrap()
                    .fields
                    .get_mut("id")
                    .unwrap()
                    .kind = Kind::Number
            }),
            ("empty fields", |s| {
                s.get_mut("user").unwrap().fields.clear()
            }),
            ("non-ASCII name", |s| {
                s.get_mut("user").unwrap().table = "usér".into()
            }),
            ("leading digit", |s| {
                s.get_mut("user").unwrap().table = "1user".into()
            }),
        ];
        for (name, mutate) in cases {
            let mut schema = fixture();
            mutate(&mut schema);
            assert!(validate_schema(schema).is_err(), "{name}");
        }
        assert!(validate_schema(Schema::new()).is_err());
    }
}
