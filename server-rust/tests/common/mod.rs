// Each integration suite compiles its own subset of these shared fixtures.
#![allow(dead_code)]

use auth_rust_comparison::{
    application::Repositories,
    domain::*,
    infrastructure::turso::{new, Field, Kind, Model, Schema},
};
use std::collections::BTreeMap;
use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime};

type FieldDefinition<'a> = (&'a str, Kind, bool);
type ModelDefinition<'a> = (&'a str, &'a [FieldDefinition<'a>]);

pub fn schema() -> Schema {
    let definitions: &[ModelDefinition<'_>] = &[
        (
            "user",
            &[
                ("id", Kind::String, false),
                ("name", Kind::String, false),
                ("email", Kind::String, false),
                ("emailVerified", Kind::Boolean, false),
                ("image", Kind::String, true),
                ("createdAt", Kind::Date, false),
                ("updatedAt", Kind::Date, false),
                ("twoFactorEnabled", Kind::Boolean, false),
            ],
        ),
        (
            "session",
            &[
                ("id", Kind::String, false),
                ("token", Kind::String, false),
                ("userId", Kind::String, false),
                ("expiresAt", Kind::Date, false),
                ("createdAt", Kind::Date, false),
                ("updatedAt", Kind::Date, false),
                ("ipAddress", Kind::String, true),
                ("userAgent", Kind::String, true),
                ("activeOrganizationId", Kind::String, true),
            ],
        ),
        (
            "account",
            &[
                ("id", Kind::String, false),
                ("accountId", Kind::String, false),
                ("providerId", Kind::String, false),
                ("userId", Kind::String, false),
                ("accessToken", Kind::String, true),
                ("refreshToken", Kind::String, true),
                ("idToken", Kind::String, true),
                ("accessTokenExpiresAt", Kind::Date, true),
                ("refreshTokenExpiresAt", Kind::Date, true),
                ("scope", Kind::String, true),
                ("password", Kind::String, true),
                ("createdAt", Kind::Date, false),
                ("updatedAt", Kind::Date, false),
            ],
        ),
        (
            "verification",
            &[
                ("id", Kind::String, false),
                ("identifier", Kind::String, false),
                ("value", Kind::String, false),
                ("expiresAt", Kind::Date, false),
                ("createdAt", Kind::Date, false),
                ("updatedAt", Kind::Date, false),
            ],
        ),
        (
            "twoFactor",
            &[
                ("id", Kind::String, false),
                ("userId", Kind::String, false),
                ("secret", Kind::String, false),
                ("backupCodes", Kind::String, false),
            ],
        ),
    ];
    definitions
        .iter()
        .map(|(name, fields)| {
            (
                (*name).into(),
                Model {
                    table: format!("fixture_{name}"),
                    id: "id".into(),
                    fields: fields
                        .iter()
                        .map(|(logical, kind, nullable)| {
                            (
                                (*logical).into(),
                                Field {
                                    column: format!("column_{logical}"),
                                    kind: *kind,
                                    nullable: *nullable,
                                },
                            )
                        })
                        .collect::<BTreeMap<_, _>>(),
                },
            )
        })
        .collect()
}

pub async fn connection(schema: &Schema) -> turso::Connection {
    let db = turso::Builder::new_local(":memory:").build().await.unwrap();
    let conn = db.connect().unwrap();
    for model in schema.values() {
        let columns: Vec<_> = model
            .fields
            .iter()
            .map(|(logical, field)| {
                let affinity = match field.kind {
                    Kind::Boolean | Kind::Number => "INTEGER",
                    _ => "TEXT",
                };
                let constraint = if logical == &model.id {
                    " PRIMARY KEY"
                } else if field.nullable {
                    ""
                } else {
                    " NOT NULL"
                };
                format!("\"{}\" {affinity}{constraint}", field.column)
            })
            .collect();
        conn.execute(
            &format!("CREATE TABLE \"{}\" ({})", model.table, columns.join(", ")),
            (),
        )
        .await
        .unwrap();
    }
    conn
}

pub async fn fixture() -> Repositories {
    let schema = schema();
    new(connection(&schema).await, schema).unwrap()
}

pub fn now() -> OffsetDateTime {
    OffsetDateTime::parse("2026-10-14T00:00:00.123Z", &Rfc3339).unwrap()
}

pub fn user(id: &str) -> User {
    User {
        id: id.into(),
        name: "Fictional".into(),
        email: format!("{id}@example.invalid"),
        email_verified: false,
        image: None,
        created_at: now(),
        updated_at: now(),
        two_factor_enabled: false,
    }
}

pub fn session(id: &str) -> Session {
    Session {
        id: id.into(),
        token: format!("fictional-{id}"),
        user_id: "u".into(),
        expires_at: now() + Duration::hours(1),
        created_at: now(),
        updated_at: now(),
        ip_address: None,
        user_agent: None,
        active_organization_id: None,
    }
}

pub fn account(id: &str) -> Account {
    Account {
        id: id.into(),
        account_id: format!("fictional-{id}"),
        provider_id: "fictional-provider".into(),
        user_id: "u".into(),
        access_token: None,
        refresh_token: None,
        id_token: None,
        access_token_expires_at: None,
        refresh_token_expires_at: None,
        scope: None,
        password: None,
        created_at: now(),
        updated_at: now(),
    }
}

pub fn verification(id: &str) -> Verification {
    Verification {
        id: id.into(),
        identifier: format!("fictional-{id}"),
        value: "{\"email\":\"fixture@example.invalid\"}".into(),
        expires_at: now() + Duration::minutes(1),
        created_at: now(),
        updated_at: now(),
    }
}

pub fn factor(id: &str) -> TwoFactor {
    TwoFactor {
        id: id.into(),
        user_id: "u".into(),
        secret: "fictional-encrypted-secret".into(),
        backup_codes: "fictional-encrypted-backups".into(),
    }
}
