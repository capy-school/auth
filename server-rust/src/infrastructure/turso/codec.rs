use super::schema::{Field, Kind};
use crate::application::{Error, Result};
use time::{format_description::well_known::Rfc3339, Date, OffsetDateTime, UtcOffset};
use turso::Value as SqlValue;

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Value {
    Null,
    Text(String),
    Bool(bool),
    Date(OffsetDateTime),
    Int(i64),
    UInt(u64),
    Float(f64),
    Json(serde_json::Value),
}

impl From<u64> for Value {
    fn from(value: u64) -> Self {
        Self::UInt(value)
    }
}

fn invalid() -> Error {
    Error::InvalidInput("invalid field kind or value")
}

pub(super) fn encode(field: &Field, value: &Value) -> Result<SqlValue> {
    if matches!(value, Value::Null) {
        return if field.nullable {
            Ok(SqlValue::Null)
        } else {
            Err(invalid())
        };
    }
    match (field.kind, value) {
        (Kind::String, Value::Text(text)) => Ok(SqlValue::Text(text.clone())),
        (Kind::Boolean, Value::Bool(flag)) => Ok(SqlValue::Integer(if *flag { 1 } else { 0 })),
        (Kind::Date, Value::Date(date)) => Ok(SqlValue::Text(format_date(*date)?)),
        (Kind::Number, Value::Int(number)) => Ok(SqlValue::Integer(*number)),
        (Kind::Number, Value::UInt(number)) => Ok(SqlValue::Integer(
            i64::try_from(*number).map_err(|_| invalid())?,
        )),
        (Kind::Number, Value::Float(number)) if number.is_finite() => Ok(SqlValue::Real(*number)),
        (Kind::Json, Value::Json(value)) => Ok(SqlValue::Text(value.to_string())),
        _ => Err(invalid()),
    }
}

pub(super) fn decode(field: &Field, value: SqlValue) -> Result<Value> {
    let value = match value {
        SqlValue::Blob(bytes) => SqlValue::Text(String::from_utf8(bytes).map_err(|_| invalid())?),
        other => other,
    };
    if value == SqlValue::Null {
        return if field.nullable {
            Ok(Value::Null)
        } else {
            Err(invalid())
        };
    }
    match (field.kind, value) {
        (Kind::String, SqlValue::Text(text)) => Ok(Value::Text(text)),
        (Kind::Boolean, SqlValue::Integer(flag)) if flag == 0 || flag == 1 => {
            Ok(Value::Bool(flag == 1))
        }
        (Kind::Date, SqlValue::Text(text)) => Ok(Value::Date(parse_date(&text)?)),
        (Kind::Number, SqlValue::Integer(number)) => Ok(Value::Int(number)),
        (Kind::Number, SqlValue::Real(number)) if number.is_finite() => Ok(Value::Float(number)),
        (Kind::Json, SqlValue::Text(text)) => Ok(Value::Json(
            serde_json::from_str(&text).map_err(|_| invalid())?,
        )),
        _ => Err(invalid()),
    }
}

fn check_date(date: OffsetDateTime) -> Result<()> {
    let millis = date.unix_timestamp_nanos().div_euclid(1_000_000);
    if !(-8_640_000_000_000_000..=8_640_000_000_000_000).contains(&millis) {
        return Err(Error::InvalidInput("date outside JavaScript range"));
    }
    Ok(())
}

fn format_date(date: OffsetDateTime) -> Result<String> {
    check_date(date)?;
    let date = date.to_offset(UtcOffset::UTC);
    let year = date.year();
    let prefix = if year < 0 {
        format!("-{:06}", -year)
    } else if year > 9999 {
        format!("+{year:06}")
    } else {
        format!("{year:04}")
    };
    Ok(format!(
        "{prefix}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        u8::from(date.month()),
        date.day(),
        date.hour(),
        date.minute(),
        date.second(),
        date.millisecond()
    ))
}

fn parse_date(text: &str) -> Result<OffsetDateTime> {
    if !text.is_ascii() {
        return Err(invalid());
    }
    let extended = text.starts_with('+') || text.starts_with('-');
    let date = if extended {
        if text.len() != 27 || !text.ends_with('Z') {
            return Err(invalid());
        }
        let year: i32 = text[..7].parse().map_err(|_| invalid())?;
        let base = OffsetDateTime::parse(&format!("2000{}", &text[7..]), &Rfc3339)
            .map_err(|_| invalid())?;
        Date::from_calendar_date(year, base.month(), base.day())
            .map_err(|_| invalid())?
            .with_time(base.time())
            .assume_utc()
    } else {
        // time's RFC3339 parser accepts arbitrary separators, lowercase z and
        // leap seconds; Go's stored-date parser rejects those representations.
        let bytes = text.as_bytes();
        if bytes.get(10) != Some(&b'T')
            || bytes.last() == Some(&b'z')
            || bytes.get(17..19) == Some(b"60")
        {
            return Err(invalid());
        }
        OffsetDateTime::parse(text, &Rfc3339)
            .map_err(|_| invalid())?
            .to_offset(UtcOffset::UTC)
    };
    check_date(date)?;
    if extended && format_date(date)? != text {
        return Err(invalid());
    }
    Ok(date)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use time::{Date, Month, Time};
    use turso::Value as SqlValue;

    fn field(kind: Kind, nullable: bool) -> Field {
        Field {
            column: "fixture".into(),
            kind,
            nullable,
        }
    }

    #[test]
    fn round_trips_the_go_codec_fixtures() {
        let when = OffsetDateTime::parse("2026-10-12T13:14:15.123987654+02:00", &Rfc3339).unwrap();
        let utc = when
            .to_offset(UtcOffset::UTC)
            .replace_nanosecond(123_000_000)
            .unwrap();
        let cases = [
            (
                Kind::String,
                Value::Text("{\"email\":\"fixture@example.invalid\"}".into()),
                SqlValue::Text("{\"email\":\"fixture@example.invalid\"}".into()),
                Value::Text("{\"email\":\"fixture@example.invalid\"}".into()),
            ),
            (
                Kind::String,
                Value::Text("deadbeef00".into()),
                SqlValue::Text("deadbeef00".into()),
                Value::Text("deadbeef00".into()),
            ),
            (
                Kind::Boolean,
                Value::Bool(true),
                SqlValue::Integer(1),
                Value::Bool(true),
            ),
            (
                Kind::Boolean,
                Value::Bool(false),
                SqlValue::Integer(0),
                Value::Bool(false),
            ),
            (
                Kind::Date,
                Value::Date(when),
                SqlValue::Text("2026-10-12T11:14:15.123Z".into()),
                Value::Date(utc),
            ),
            (
                Kind::Number,
                Value::Int(42),
                SqlValue::Integer(42),
                Value::Int(42),
            ),
            (
                Kind::Number,
                Value::UInt(42),
                SqlValue::Integer(42),
                Value::Int(42),
            ),
            (
                Kind::Number,
                Value::Float(1.25),
                SqlValue::Real(1.25),
                Value::Float(1.25),
            ),
            (
                Kind::Json,
                Value::Json(json!({"enabled": true})),
                SqlValue::Text("{\"enabled\":true}".into()),
                Value::Json(json!({"enabled":true})),
            ),
        ];
        for (kind, input, stored, output) in cases {
            let f = field(kind, false);
            assert_eq!(encode(&f, &input).unwrap(), stored);
            assert_eq!(decode(&f, stored).unwrap(), output);
        }
        let f = field(Kind::String, true);
        assert_eq!(encode(&f, &Value::Null).unwrap(), SqlValue::Null);
        assert_eq!(decode(&f, SqlValue::Null).unwrap(), Value::Null);
    }

    #[test]
    fn rejects_bad_types_nulls_nonfinite_numbers_and_corrupt_storage_without_echoing_values() {
        for (kind, value) in [
            (Kind::String, Value::Int(7)),
            (Kind::Boolean, Value::Int(1)),
            (Kind::Date, Value::Text("2026-10-12".into())),
            (
                Kind::Number,
                Value::Text("fictional-secret-do-not-echo".into()),
            ),
            (Kind::Number, Value::Float(f64::NAN)),
            (Kind::Number, Value::Float(f64::INFINITY)),
            (Kind::Number, Value::UInt(u64::MAX)),
        ] {
            let error = encode(&field(kind, false), &value).unwrap_err();
            assert!(!error.to_string().contains("fictional-secret"));
        }
        for kind in [
            Kind::String,
            Kind::Boolean,
            Kind::Date,
            Kind::Number,
            Kind::Json,
        ] {
            assert!(encode(&field(kind, false), &Value::Null).is_err());
            assert!(decode(&field(kind, false), SqlValue::Null).is_err());
        }
        for (kind, stored) in [
            (Kind::Boolean, SqlValue::Integer(2)),
            (Kind::Boolean, SqlValue::Real(1.0)),
            (Kind::Boolean, SqlValue::Text("true".into())),
            (Kind::String, SqlValue::Integer(1)),
            (Kind::Date, SqlValue::Text("not-a-date".into())),
            (Kind::Date, SqlValue::Integer(123)),
            (Kind::Json, SqlValue::Text("{".into())),
            (Kind::Json, SqlValue::Integer(1)),
            (Kind::Number, SqlValue::Text("42".into())),
            (Kind::Number, SqlValue::Real(f64::NAN)),
        ] {
            assert!(decode(&field(kind, false), stored).is_err());
        }
    }

    #[test]
    fn accepts_utf8_database_text_bytes() {
        for (kind, text) in [
            (Kind::String, "opaque"),
            (Kind::Date, "2026-10-12T00:00:00.000Z"),
            (Kind::Json, "{\"a\":1}"),
        ] {
            assert!(decode(
                &field(kind, false),
                SqlValue::Blob(text.as_bytes().to_vec())
            )
            .is_ok());
        }
        assert!(decode(&field(Kind::String, false), SqlValue::Blob(vec![255])).is_err());
    }

    #[test]
    fn stored_dates_reject_separators_and_timezone_case_that_go_rejects() {
        for text in [
            "2026-10-12X11:14:15.123Z",
            "2026-10-12 11:14:15.123Z",
            "2026-10-12t11:14:15.123Z",
            "2026-10-12T11:14:15.123z",
        ] {
            let result = decode(&field(Kind::Date, false), SqlValue::Text(text.into()));
            assert!(
                result.is_err(),
                "accepted malformed date {text}: {result:?}"
            );
        }
    }

    #[test]
    fn stored_dates_reject_leap_seconds_instead_of_normalizing_them() {
        let result = decode(
            &field(Kind::Date, false),
            SqlValue::Text("2016-12-31T23:59:60Z".into()),
        );
        assert!(
            result.is_err(),
            "normalized unsupported leap second: {result:?}"
        );
    }

    #[test]
    fn stored_dates_preserve_valid_offsets_and_fractional_precision() {
        for (text, utc) in [
            ("2026-10-12T13:14:15+02:00", "2026-10-12T11:14:15Z"),
            (
                "2026-10-12T06:14:15.123987654-05:00",
                "2026-10-12T11:14:15.123987654Z",
            ),
            ("2026-10-12T11:14:15.1Z", "2026-10-12T11:14:15.1Z"),
        ] {
            assert_eq!(
                decode(&field(Kind::Date, false), SqlValue::Text(text.into())).unwrap(),
                Value::Date(OffsetDateTime::parse(utc, &Rfc3339).unwrap()),
            );
        }
    }

    #[test]
    fn dates_match_extended_javascript_years_and_timeclip_bounds() {
        for (year, iso) in [
            (0, "0000-01-01T00:00:00.000Z"),
            (-1, "-000001-01-01T00:00:00.000Z"),
            (10000, "+010000-01-01T00:00:00.000Z"),
        ] {
            let date = Date::from_calendar_date(year, Month::January, 1)
                .unwrap()
                .with_time(Time::MIDNIGHT)
                .assume_utc();
            let f = field(Kind::Date, false);
            assert_eq!(
                encode(&f, &Value::Date(date)).unwrap(),
                SqlValue::Text(iso.into())
            );
            assert_eq!(
                decode(&f, SqlValue::Text(iso.into())).unwrap(),
                Value::Date(date)
            );
        }
        for ms in [-8_640_000_000_000_000_i64, 8_640_000_000_000_000] {
            let date =
                OffsetDateTime::from_unix_timestamp_nanos(i128::from(ms) * 1_000_000).unwrap();
            let stored = encode(&field(Kind::Date, false), &Value::Date(date)).unwrap();
            assert_eq!(
                decode(&field(Kind::Date, false), stored).unwrap(),
                Value::Date(date)
            );
        }
        for nanos in [
            8_640_000_000_000_001_i128 * 1_000_000,
            -8_640_000_000_000_000_i128 * 1_000_000 - 1,
        ] {
            let date = OffsetDateTime::from_unix_timestamp_nanos(nanos).unwrap();
            assert!(encode(&field(Kind::Date, false), &Value::Date(date)).is_err());
        }
        for invalid in [
            "-000000-01-01T00:00:00.000Z",
            "+001000-01-01T00:00:00.000Z",
            "+010000-02-30T00:00:00.000Z",
            "+275760-09-13T00:00:00.001Z",
        ] {
            assert!(decode(&field(Kind::Date, false), SqlValue::Text(invalid.into())).is_err());
        }
    }
}
