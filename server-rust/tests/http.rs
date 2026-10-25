use auth_rust_comparison::http::app;
use ohkami::{testing::*, Status};
use serde_json::json;

#[tokio::test]
async fn health_is_only_a_fixed_disconnected_diagnostic_without_cookies() {
    let server = app().test();
    let response = server.oneshot(TestRequest::GET("/healthz")).await;
    assert_eq!(response.status(), Status::OK);
    assert_eq!(response.header("Cache-Control"), Some("no-store"));
    assert_eq!(response.header("Set-Cookie"), None);
    assert_eq!(
        response.json::<serde_json::Value>(),
        Some(json!({
            "candidate": "rust-ohkami-comparison",
            "authentication": false,
            "storage_connected": false,
        }))
    );
}

#[tokio::test]
async fn auth_and_crud_routes_are_not_exposed() {
    let server = app().test();
    for path in [
        "/",
        "/users",
        "/users/u",
        "/api/session",
        "/api/auth/get-session",
    ] {
        let response = server.oneshot(TestRequest::GET(path)).await;
        assert_eq!(response.status(), Status::NotFound, "{path}");
        assert_eq!(response.header("Set-Cookie"), None);
    }
    let response = server.oneshot(TestRequest::POST("/healthz")).await;
    assert_eq!(response.status(), Status::NotFound);
}
