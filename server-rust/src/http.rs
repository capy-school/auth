//! Diagnostic delivery adapter. No repository or authentication engine is wired here.

use ohkami::{IntoResponse, Json, Ohkami, Response, Route};

#[derive(serde::Serialize)]
struct Diagnostic {
    candidate: &'static str,
    authentication: bool,
    storage_connected: bool,
}

async fn health() -> Response {
    Json(Diagnostic {
        candidate: "rust-ohkami-comparison",
        authentication: false,
        storage_connected: false,
    })
    .into_response()
    .with_headers(|headers| headers.cache_control("no-store"))
}

pub fn app() -> Ohkami {
    Ohkami::new("/healthz".GET(health))
}
