use super::{
    codec::Value,
    mapping::{self, Entity},
    schema::Schema,
    store::{Record, Store},
    transaction::Transactions,
};
use crate::{
    application::{self, Error, Page, RepoFuture, Repositories, Result},
    domain::*,
};
use std::{marker::PhantomData, sync::Arc};

struct TypedRepository<T> {
    store: Arc<Store>,
    entity: PhantomData<T>,
}

impl<T: Entity> TypedRepository<T> {
    fn new(store: Arc<Store>) -> Self {
        Self {
            store,
            entity: PhantomData,
        }
    }
    async fn find(&self, filter: Record, page: Page) -> Result<Vec<T>> {
        self.store
            .find(T::MODEL, filter, page)
            .await?
            .into_iter()
            .map(|record| T::from_record(&record))
            .collect()
    }
    async fn one(&self, filter: Record) -> Result<T> {
        let mut rows = self
            .find(
                filter,
                Page {
                    limit: 2,
                    offset: 0,
                },
            )
            .await?;
        match rows.len() {
            0 => Err(Error::NotFound),
            1 => Ok(rows.remove(0)),
            _ => Err(Error::NonUnique),
        }
    }
}

impl<T: Entity> application::Repository<T> for TypedRepository<T> {
    fn create(&self, entity: T) -> RepoFuture<'_, ()> {
        Box::pin(async move { self.store.create(T::MODEL, entity.record()).await })
    }
    fn get(&self, id: String) -> RepoFuture<'_, T> {
        Box::pin(async move { T::from_record(&self.store.get(T::MODEL, &id).await?) })
    }
    fn list(&self, page: Page) -> RepoFuture<'_, Vec<T>> {
        Box::pin(async move { self.find(Record::new(), page).await })
    }
    fn update(&self, entity: T) -> RepoFuture<'_, ()> {
        Box::pin(async move {
            let mut record = entity.record();
            let Some(Value::Text(id)) = record.remove("id") else {
                return Err(Error::InvalidInput("invalid entity ID"));
            };
            self.store.update(T::MODEL, &id, record).await
        })
    }
    fn delete(&self, id: String) -> RepoFuture<'_, ()> {
        Box::pin(async move { self.store.delete(T::MODEL, &id).await })
    }
}

impl application::UserRepository for TypedRepository<User> {
    fn by_email(&self, email: String) -> RepoFuture<'_, User> {
        Box::pin(async move {
            self.one(Record::from([("email".into(), Value::Text(email))]))
                .await
        })
    }
}
impl application::SessionRepository for TypedRepository<Session> {
    fn by_token(&self, token: String) -> RepoFuture<'_, Session> {
        Box::pin(async move {
            self.one(Record::from([("token".into(), Value::Text(token))]))
                .await
        })
    }
    fn for_user(&self, id: String, page: Page) -> RepoFuture<'_, Vec<Session>> {
        Box::pin(async move {
            self.find(Record::from([("userId".into(), Value::Text(id))]), page)
                .await
        })
    }
}
impl application::AccountRepository for TypedRepository<Account> {
    fn by_provider(&self, provider: String, id: String) -> RepoFuture<'_, Account> {
        Box::pin(async move {
            self.one(Record::from([
                ("providerId".into(), Value::Text(provider)),
                ("accountId".into(), Value::Text(id)),
            ]))
            .await
        })
    }
    fn for_user(&self, id: String, page: Page) -> RepoFuture<'_, Vec<Account>> {
        Box::pin(async move {
            self.find(Record::from([("userId".into(), Value::Text(id))]), page)
                .await
        })
    }
}
impl application::VerificationRepository for TypedRepository<Verification> {
    fn by_identifier(&self, id: String) -> RepoFuture<'_, Verification> {
        Box::pin(async move {
            self.one(Record::from([("identifier".into(), Value::Text(id))]))
                .await
        })
    }
}
impl application::TwoFactorRepository for TypedRepository<TwoFactor> {
    fn for_user(&self, id: String) -> RepoFuture<'_, TwoFactor> {
        Box::pin(async move {
            self.one(Record::from([("userId".into(), Value::Text(id))]))
                .await
        })
    }
}

/// Validate metadata and bindings without querying or altering the injected connection.
pub fn create(connection: turso::Connection, schema: Schema) -> Result<Repositories> {
    let store = Arc::new(Store::new(connection, schema)?);
    mapping::validate::<User>(&store.schema)?;
    mapping::validate::<Session>(&store.schema)?;
    mapping::validate::<Account>(&store.schema)?;
    mapping::validate::<Verification>(&store.schema)?;
    mapping::validate::<TwoFactor>(&store.schema)?;
    Ok(bundle(store))
}

pub(super) fn bundle(store: Arc<Store>) -> Repositories {
    Repositories {
        users: Arc::new(TypedRepository::<User>::new(store.clone())),
        sessions: Arc::new(TypedRepository::<Session>::new(store.clone())),
        accounts: Arc::new(TypedRepository::<Account>::new(store.clone())),
        verifications: Arc::new(TypedRepository::<Verification>::new(store.clone())),
        two_factors: Arc::new(TypedRepository::<TwoFactor>::new(store.clone())),
        transactions: Arc::new(Transactions { store }),
    }
}
