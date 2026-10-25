mod common;

use auth_rust_comparison::application::*;
use common::*;
use std::sync::{Arc, Mutex};

#[tokio::test]
async fn commit_and_callback_rollback_cover_multiple_tables() {
    for fail in [false, true] {
        let r = fixture().await;
        let result = r
            .transactions
            .within_transaction(Box::new(move |tx| {
                Box::pin(async move {
                    tx.users.create(user("u")).await?;
                    tx.two_factors.create(factor("f")).await?;
                    if fail {
                        return Err(Error::InvalidInput("callback rejected"));
                    }
                    Ok(())
                })
            }))
            .await;
        if fail {
            assert_eq!(
                result.unwrap_err(),
                Error::InvalidInput("callback rejected")
            );
            assert_eq!(r.users.get("u".into()).await.unwrap_err(), Error::NotFound);
            assert_eq!(
                r.two_factors.get("f".into()).await.unwrap_err(),
                Error::NotFound
            );
        } else {
            result.unwrap();
            assert_eq!(r.users.get("u".into()).await.unwrap().id, "u");
            assert_eq!(r.two_factors.get("f".into()).await.unwrap().id, "f");
        }
    }
}

#[tokio::test]
async fn a_constraint_error_rolls_back_the_whole_unit() {
    let r = fixture().await;
    let result = r
        .transactions
        .within_transaction(Box::new(|tx| {
            Box::pin(async move {
                tx.users.create(user("u")).await?;
                tx.two_factors.create(factor("duplicate")).await?;
                tx.two_factors.create(factor("duplicate")).await
            })
        }))
        .await;
    assert!(result.is_err());
    assert_eq!(r.users.get("u".into()).await.unwrap_err(), Error::NotFound);
    assert_eq!(
        r.two_factors.get("duplicate".into()).await.unwrap_err(),
        Error::NotFound
    );
}

#[tokio::test]
async fn panic_invalidates_the_scope_and_next_root_access_rolls_back() {
    let r = fixture().await;
    let worker = r.clone();
    let task = tokio::spawn(async move {
        worker
            .transactions
            .within_transaction(Box::new(|tx| {
                Box::pin(async move {
                    tx.users.create(user("panic")).await?;
                    panic!("expected callback panic");
                })
            }))
            .await
    });
    assert!(task.await.unwrap_err().is_panic());
    assert_eq!(
        r.users.get("panic".into()).await.unwrap_err(),
        Error::NotFound
    );
    r.users.create(user("after-panic")).await.unwrap();
}

#[tokio::test]
async fn an_aborted_callback_future_rolls_back_before_the_next_root_operation() {
    let r = fixture().await;
    let worker = r.clone();
    let (entered, ready) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        worker
            .transactions
            .within_transaction(Box::new(move |tx| {
                Box::pin(async move {
                    tx.users.create(user("cancelled")).await?;
                    entered.send(()).unwrap();
                    std::future::pending::<()>().await;
                    Ok(())
                })
            }))
            .await
    });
    ready.await.unwrap();
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert_eq!(
        r.users.get("cancelled".into()).await.unwrap_err(),
        Error::NotFound
    );
    r.users.create(user("after-cancel")).await.unwrap();
}

#[tokio::test]
async fn nested_transactions_and_escaped_handles_cannot_use_the_outer_connection() {
    let r = fixture().await;
    let leaked = Arc::new(Mutex::new(None));
    let capture = leaked.clone();
    r.transactions
        .within_transaction(Box::new(move |tx| {
            Box::pin(async move {
                assert_eq!(
                    tx.transactions
                        .within_transaction(Box::new(|_| Box::pin(async { Ok(()) })))
                        .await
                        .unwrap_err(),
                    Error::NestedTransaction
                );
                *capture.lock().unwrap() = Some(tx);
                Ok(())
            })
        }))
        .await
        .unwrap();
    let tx = leaked.lock().unwrap().take().unwrap();
    assert_eq!(
        tx.users.create(user("leaked")).await.unwrap_err(),
        Error::ClosedScope
    );
    assert_eq!(
        r.users.get("leaked".into()).await.unwrap_err(),
        Error::NotFound
    );
}

#[tokio::test]
async fn a_task_retaining_transaction_handles_cannot_write_after_commit() {
    let r = fixture().await;
    let release = Arc::new(tokio::sync::Notify::new());
    let wait = release.clone();
    let handle = Arc::new(Mutex::new(None));
    let capture = handle.clone();
    r.transactions
        .within_transaction(Box::new(move |tx| {
            Box::pin(async move {
                *capture.lock().unwrap() = Some(tokio::spawn(async move {
                    wait.notified().await;
                    tx.users.create(user("late")).await
                }));
                Ok(())
            })
        }))
        .await
        .unwrap();
    release.notify_one();
    let task = handle.lock().unwrap().take().unwrap();
    assert_eq!(task.await.unwrap().unwrap_err(), Error::ClosedScope);
    assert_eq!(
        r.users.get("late".into()).await.unwrap_err(),
        Error::NotFound
    );
}
