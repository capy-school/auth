mod common;

use auth_rust_comparison::{
    application::*,
    infrastructure::turso::{new, Kind},
};
use common::*;
use std::fmt::Debug;

async fn lifecycle<T: Clone + PartialEq + Debug, R: Repository<T> + ?Sized>(
    repo: &R,
    entity: T,
    changed: T,
    id: &str,
) {
    repo.create(entity.clone()).await.unwrap();
    assert_eq!(repo.get(id.into()).await.unwrap(), entity);
    assert_eq!(repo.list(Page::default()).await.unwrap().len(), 1);
    assert!(repo.create(entity).await.is_err());
    repo.update(changed.clone()).await.unwrap();
    assert_eq!(repo.get(id.into()).await.unwrap(), changed);
    repo.delete(id.into()).await.unwrap();
    assert_eq!(repo.get(id.into()).await.unwrap_err(), Error::NotFound);
    assert_eq!(repo.update(changed).await.unwrap_err(), Error::NotFound);
    assert_eq!(repo.delete(id.into()).await.unwrap_err(), Error::NotFound);
}

#[tokio::test]
async fn five_typed_models_match_go_lifecycles_and_optional_values() {
    let r = fixture().await;
    let original = user("u");
    let mut changed = original.clone();
    changed.name = "Edited".into();
    changed.email_verified = true;
    changed.image = Some("https://example.invalid/image".into());
    lifecycle(&*r.users, original, changed, "u").await;
    let original = session("s");
    let mut changed = original.clone();
    changed.user_agent = Some("fiction-agent".into());
    lifecycle(&*r.sessions, original, changed, "s").await;
    let original = account("a");
    let mut changed = original.clone();
    changed.access_token = Some("fictional-opaque-token".into());
    changed.access_token_expires_at = Some(now());
    lifecycle(&*r.accounts, original, changed, "a").await;
    let original = verification("v");
    let mut changed = original.clone();
    changed.value = "opaque-edited-value".into();
    lifecycle(&*r.verifications, original, changed, "v").await;
    let original = factor("f");
    let mut changed = original.clone();
    changed.backup_codes = "opaque-edited-ciphertext".into();
    lifecycle(&*r.two_factors, original, changed, "f").await;
}

#[tokio::test]
async fn specialized_lookups_preserve_target_fields_and_ambiguity_errors() {
    let r = fixture().await;
    let u = user("u");
    r.users.create(u.clone()).await.unwrap();
    assert_eq!(r.users.by_email(u.email.clone()).await.unwrap(), u);
    let s = session("s");
    r.sessions.create(s.clone()).await.unwrap();
    assert_eq!(r.sessions.by_token(s.token.clone()).await.unwrap(), s);
    assert_eq!(
        r.sessions
            .for_user("u".into(), Page::default())
            .await
            .unwrap()
            .len(),
        1
    );
    let a = account("a");
    r.accounts.create(a.clone()).await.unwrap();
    assert_eq!(
        r.accounts
            .by_provider(a.provider_id.clone(), a.account_id.clone())
            .await
            .unwrap(),
        a
    );
    assert_eq!(
        r.accounts
            .for_user("u".into(), Page::default())
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        r.accounts
            .by_provider("different".into(), a.account_id)
            .await
            .unwrap_err(),
        Error::NotFound
    );
    let v = verification("v");
    r.verifications.create(v.clone()).await.unwrap();
    assert_eq!(
        r.verifications
            .by_identifier(v.identifier.clone())
            .await
            .unwrap(),
        v
    );
    let f = factor("f");
    r.two_factors.create(f.clone()).await.unwrap();
    assert_eq!(r.two_factors.for_user("u".into()).await.unwrap(), f);
    let mut duplicate = user("other");
    duplicate.email = u.email.clone();
    r.users.create(duplicate).await.unwrap();
    assert_eq!(
        r.users.by_email(u.email).await.unwrap_err(),
        Error::NonUnique
    );
}

#[tokio::test]
async fn incompatible_mapping_fails_construction_and_valid_mapping_does_not_query_the_db() {
    type Mutation = fn(&mut auth_rust_comparison::infrastructure::turso::Schema);
    let mutations: &[Mutation] = &[
        |s| {
            s.remove("twoFactor");
        },
        |s| {
            s.get_mut("user").unwrap().fields.remove("twoFactorEnabled");
        },
        |s| {
            s.get_mut("session")
                .unwrap()
                .fields
                .get_mut("token")
                .unwrap()
                .kind = Kind::Json
        },
        |s| {
            s.get_mut("user")
                .unwrap()
                .fields
                .get_mut("email")
                .unwrap()
                .nullable = true
        },
    ];
    for mutate in mutations {
        let mut mapping = schema();
        mutate(&mut mapping);
        let db = turso::Builder::new_local(":memory:").build().await.unwrap();
        assert!(new(db.connect().unwrap(), mapping).is_err());
    }
    let db = turso::Builder::new_local(":memory:").build().await.unwrap();
    let r = new(db.connect().unwrap(), schema()).unwrap();
    assert!(matches!(
        r.users.get("absent".into()).await,
        Err(Error::Storage(_))
    ));
}
