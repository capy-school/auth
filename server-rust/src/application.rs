//! Application-owned repository contracts.

use crate::domain::{Account, Session, TwoFactor, User, Verification};
use std::{fmt, future::Future, pin::Pin, sync::Arc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    NotFound,
    NonUnique,
    InvalidInput(&'static str),
    NestedTransaction,
    ClosedScope,
    Storage(String),
    RollbackFailed {
        operation: Box<Error>,
        rollback: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => f.write_str("authentication record not found"),
            Self::NonUnique => f.write_str("authentication lookup is not unique"),
            Self::InvalidInput(message) => f.write_str(message),
            Self::NestedTransaction => f.write_str("nested transaction is not supported"),
            Self::ClosedScope => f.write_str("transaction scope has ended"),
            Self::Storage(message) => write!(f, "storage: {message}"),
            Self::RollbackFailed {
                operation,
                rollback,
            } => write!(f, "{operation}; rollback failed: {rollback}"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;
pub type RepoFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T>> + Send + 'a>>;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Page {
    pub limit: i64,
    pub offset: i64,
}

impl Page {
    pub fn bounds(self) -> Result<(i64, i64)> {
        if self.limit < 0 || self.offset < 0 {
            return Err(Error::InvalidInput("negative pagination"));
        }
        Ok((
            if self.limit == 0 {
                100
            } else {
                self.limit.min(1000)
            },
            self.offset,
        ))
    }
}

pub trait Repository<T>: Send + Sync {
    fn create(&self, entity: T) -> RepoFuture<'_, ()>;
    fn get(&self, id: String) -> RepoFuture<'_, T>;
    fn list(&self, page: Page) -> RepoFuture<'_, Vec<T>>;
    fn update(&self, entity: T) -> RepoFuture<'_, ()>;
    fn delete(&self, id: String) -> RepoFuture<'_, ()>;
}

pub trait UserRepository: Repository<User> {
    fn by_email(&self, email: String) -> RepoFuture<'_, User>;
}

pub trait SessionRepository: Repository<Session> {
    fn by_token(&self, token: String) -> RepoFuture<'_, Session>;
    fn for_user(&self, user_id: String, page: Page) -> RepoFuture<'_, Vec<Session>>;
}

pub trait AccountRepository: Repository<Account> {
    fn by_provider(&self, provider: String, account_id: String) -> RepoFuture<'_, Account>;
    fn for_user(&self, user_id: String, page: Page) -> RepoFuture<'_, Vec<Account>>;
}

pub trait VerificationRepository: Repository<Verification> {
    fn by_identifier(&self, identifier: String) -> RepoFuture<'_, Verification>;
}

pub trait TwoFactorRepository: Repository<TwoFactor> {
    fn for_user(&self, user_id: String) -> RepoFuture<'_, TwoFactor>;
}

#[derive(Clone)]
pub struct Repositories {
    pub users: Arc<dyn UserRepository>,
    pub sessions: Arc<dyn SessionRepository>,
    pub accounts: Arc<dyn AccountRepository>,
    pub verifications: Arc<dyn VerificationRepository>,
    pub two_factors: Arc<dyn TwoFactorRepository>,
    pub transactions: Arc<dyn UnitOfWork>,
}

pub type TransactionCallback<'a> = Box<dyn FnOnce(Repositories) -> RepoFuture<'a, ()> + Send + 'a>;

pub trait UnitOfWork: Send + Sync {
    fn within_transaction<'a>(&'a self, callback: TransactionCallback<'a>) -> RepoFuture<'a, ()>;
}
