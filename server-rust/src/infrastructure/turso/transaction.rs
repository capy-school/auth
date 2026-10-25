use super::{
    repositories::bundle,
    store::{storage_error, Scope, Store},
};
use crate::application::{Error, RepoFuture, TransactionCallback, UnitOfWork};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::sync::Mutex;

pub(super) struct Transactions {
    pub store: Arc<Store>,
}

struct ActiveScope(Arc<Scope>);

impl Drop for ActiveScope {
    fn drop(&mut self) {
        self.0.active.store(false, Ordering::SeqCst);
    }
}

impl UnitOfWork for Transactions {
    fn within_transaction<'a>(&'a self, callback: TransactionCallback<'a>) -> RepoFuture<'a, ()> {
        Box::pin(async move {
            if self.store.scope.is_some() {
                return Err(Error::NestedTransaction);
            }
            let _root = self.store.enter().await?;
            let scope = Arc::new(Scope {
                active: AtomicBool::new(true),
                gate: Mutex::new(()),
            });
            let _active = ActiveScope(scope.clone());
            *self
                .store
                .shared
                .cleanup
                .lock()
                .map_err(|_| Error::InvalidInput("transaction cleanup lock poisoned"))? =
                Some(scope.clone());
            // Arm recovery before BEGIN: cancellation can occur before a driver guard exists.
            self.store
                .shared
                .conn
                .execute("BEGIN DEFERRED", ())
                .await
                .map_err(storage_error)?;
            let scoped = Arc::new(Store {
                shared: self.store.shared.clone(),
                schema: self.store.schema.clone(),
                scope: Some(scope.clone()),
            });
            let outcome = callback(bundle(scoped)).await;
            // No child SQL may race finalization or resume outside this transaction.
            let _finish = scope.gate.lock().await;
            scope.active.store(false, Ordering::SeqCst);
            let result = match outcome {
                Ok(()) => self
                    .store
                    .shared
                    .conn
                    .execute("COMMIT", ())
                    .await
                    .map(|_| ())
                    .map_err(storage_error),
                Err(operation) => Err(operation),
            };
            let result = match result {
                Err(operation)
                    if !self
                        .store
                        .shared
                        .conn
                        .is_autocommit()
                        .map_err(storage_error)? =>
                {
                    match self.store.shared.conn.execute("ROLLBACK", ()).await {
                        Ok(_) => Err(operation),
                        Err(rollback) => Err(Error::RollbackFailed {
                            operation: Box::new(operation),
                            rollback: rollback.to_string(),
                        }),
                    }
                }
                other => other,
            };
            if self
                .store
                .shared
                .conn
                .is_autocommit()
                .map_err(storage_error)?
            {
                self.store
                    .shared
                    .cleanup
                    .lock()
                    .map_err(|_| Error::InvalidInput("transaction cleanup lock poisoned"))?
                    .take();
            }
            result
        })
    }
}
