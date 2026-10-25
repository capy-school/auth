use auth_rust_comparison::{application::*, domain::*};
use time::OffsetDateTime;

#[test]
fn pagination_matches_the_go_storage_bounds() {
    for (page, expected) in [
        (Page::default(), (100, 0)),
        (
            Page {
                limit: 1,
                offset: 2,
            },
            (1, 2),
        ),
        (
            Page {
                limit: 2000,
                offset: 0,
            },
            (1000, 0),
        ),
    ] {
        assert_eq!(page.bounds().unwrap(), expected);
    }
    for page in [
        Page {
            limit: -1,
            offset: 0,
        },
        Page {
            limit: 0,
            offset: -1,
        },
    ] {
        assert!(page.bounds().is_err());
    }
}

#[test]
fn domain_retains_optional_fields_and_opaque_values() {
    let now = OffsetDateTime::UNIX_EPOCH;
    let user = User {
        id: "u".into(),
        name: "Fictional".into(),
        email: "fixture@example.invalid".into(),
        email_verified: false,
        image: None,
        created_at: now,
        updated_at: now,
        two_factor_enabled: false,
    };
    let session = Session {
        id: "s".into(),
        token: "fictional-token".into(),
        user_id: user.id.clone(),
        expires_at: now,
        created_at: now,
        updated_at: now,
        ip_address: None,
        user_agent: None,
        active_organization_id: None,
    };
    let account = Account {
        id: "a".into(),
        account_id: "fictional-provider-account".into(),
        provider_id: "fictional".into(),
        user_id: user.id.clone(),
        access_token: None,
        refresh_token: None,
        id_token: None,
        access_token_expires_at: None,
        refresh_token_expires_at: None,
        scope: None,
        password: None,
        created_at: now,
        updated_at: now,
    };
    let verification = Verification {
        id: "v".into(),
        identifier: "fictional-token".into(),
        value: "opaque-json".into(),
        expires_at: now,
        created_at: now,
        updated_at: now,
    };
    let factor = TwoFactor {
        id: "f".into(),
        user_id: user.id.clone(),
        secret: "opaque-ciphertext".into(),
        backup_codes: "opaque-backups".into(),
    };
    assert_eq!(session.user_id, user.id);
    assert!(account.access_token.is_none());
    assert_eq!(verification.value, "opaque-json");
    assert_eq!(factor.secret, "opaque-ciphertext");
}

#[test]
fn inner_contracts_are_shareable_and_framework_free() {
    fn send_sync<T: Send + Sync>() {}
    send_sync::<Repositories>();
    send_sync::<User>();
    for source in [
        include_str!("../src/domain.rs"),
        include_str!("../src/application.rs"),
    ] {
        for forbidden in ["ohkami::", "turso::", "tokio::", "serde::"] {
            assert!(
                !source.contains(forbidden),
                "inner layer imports {forbidden}"
            );
        }
    }
}
