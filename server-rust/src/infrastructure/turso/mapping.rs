use super::{
    codec::Value,
    schema::{Kind, Schema},
    store::Record,
};
use crate::{
    application::{Error, Result},
    domain::*,
};
use time::OffsetDateTime;

pub(super) trait Entity: Send + Sync + 'static {
    const MODEL: &'static str;
    fn fields() -> Vec<(&'static str, Kind, bool)>;
    fn record(&self) -> Record;
    fn from_record(record: &Record) -> Result<Self>
    where
        Self: Sized;
}

trait Cell: Sized {
    const KIND: Kind;
    const NULLABLE: bool = false;
    fn value(&self) -> Value;
    fn read(value: &Value) -> Result<Self>;
}

impl Cell for String {
    const KIND: Kind = Kind::String;
    fn value(&self) -> Value {
        Value::Text(self.clone())
    }
    fn read(value: &Value) -> Result<Self> {
        match value {
            Value::Text(text) => Ok(text.clone()),
            _ => Err(Error::InvalidInput("invalid decoded string")),
        }
    }
}

macro_rules! copy_cell {
    ($type:ty, $kind:ident, $variant:ident) => {
        impl Cell for $type {
            const KIND: Kind = Kind::$kind;
            fn value(&self) -> Value {
                Value::$variant(*self)
            }
            fn read(value: &Value) -> Result<Self> {
                match value {
                    Value::$variant(value) => Ok(*value),
                    _ => Err(Error::InvalidInput("invalid decoded value")),
                }
            }
        }
    };
}
copy_cell!(bool, Boolean, Bool);
copy_cell!(OffsetDateTime, Date, Date);

impl<T: Cell> Cell for Option<T> {
    const KIND: Kind = T::KIND;
    const NULLABLE: bool = true;
    fn value(&self) -> Value {
        self.as_ref().map_or(Value::Null, Cell::value)
    }
    fn read(value: &Value) -> Result<Self> {
        match value {
            Value::Null => Ok(None),
            other => T::read(other).map(Some),
        }
    }
}

macro_rules! entity {
    ($type:ty, $model:literal, { $($field:ident : $kind:ty => $logical:literal),+ $(,)? }) => {
        impl Entity for $type {
            const MODEL: &'static str = $model;
            fn fields() -> Vec<(&'static str, Kind, bool)> {
                vec![$(($logical, <$kind as Cell>::KIND, <$kind as Cell>::NULLABLE)),+]
            }
            fn record(&self) -> Record {
                Record::from([$(($logical.into(), self.$field.value())),+])
            }
            fn from_record(record: &Record) -> Result<Self> {
                Ok(Self { $($field: <$kind as Cell>::read(record.get($logical)
                    .ok_or(Error::InvalidInput("incomplete decoded record"))?)?),+ })
            }
        }
    };
}

entity!(User, "user", {
    id: String => "id", name: String => "name", email: String => "email", email_verified: bool => "emailVerified",
    image: Option<String> => "image", created_at: OffsetDateTime => "createdAt", updated_at: OffsetDateTime => "updatedAt",
    two_factor_enabled: bool => "twoFactorEnabled",
});
entity!(Session, "session", {
    id: String => "id", token: String => "token", user_id: String => "userId", expires_at: OffsetDateTime => "expiresAt",
    created_at: OffsetDateTime => "createdAt", updated_at: OffsetDateTime => "updatedAt", ip_address: Option<String> => "ipAddress",
    user_agent: Option<String> => "userAgent", active_organization_id: Option<String> => "activeOrganizationId",
});
entity!(Account, "account", {
    id: String => "id", account_id: String => "accountId", provider_id: String => "providerId", user_id: String => "userId",
    access_token: Option<String> => "accessToken", refresh_token: Option<String> => "refreshToken", id_token: Option<String> => "idToken",
    access_token_expires_at: Option<OffsetDateTime> => "accessTokenExpiresAt", refresh_token_expires_at: Option<OffsetDateTime> => "refreshTokenExpiresAt",
    scope: Option<String> => "scope", password: Option<String> => "password", created_at: OffsetDateTime => "createdAt", updated_at: OffsetDateTime => "updatedAt",
});
entity!(Verification, "verification", {
    id: String => "id", identifier: String => "identifier", value: String => "value", expires_at: OffsetDateTime => "expiresAt",
    created_at: OffsetDateTime => "createdAt", updated_at: OffsetDateTime => "updatedAt",
});
entity!(TwoFactor, "twoFactor", {
    id: String => "id", user_id: String => "userId", secret: String => "secret", backup_codes: String => "backupCodes",
});

pub(super) fn validate<T: Entity>(schema: &Schema) -> Result<()> {
    let model = schema
        .get(T::MODEL)
        .ok_or(Error::InvalidInput("missing entity model"))?;
    if model.id != "id" {
        return Err(Error::InvalidInput("incompatible primary key mapping"));
    }
    for (logical, kind, nullable) in T::fields() {
        let field = model
            .fields
            .get(logical)
            .ok_or(Error::InvalidInput("missing entity field"))?;
        if field.kind != kind || field.nullable != nullable {
            return Err(Error::InvalidInput("incompatible entity field mapping"));
        }
    }
    Ok(())
}
