use auth_rust_comparison::http::app;
use std::io;

fn port(args: &[String]) -> io::Result<u16> {
    match args {
        [] => Ok(5051),
        [flag, value] if flag == "--port" => value.parse().map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "port must be an integer from 0 to 65535",
            )
        }),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "usage: auth-rust-comparison [--port PORT]",
        )),
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> io::Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port(&args)?)).await?;
    println!(
        "Rust comparison: http://{} (diagnostic only)",
        listener.local_addr()?
    );
    app().howl(listener).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_the_default_or_a_numeric_port() {
        assert_eq!(port(&[]).unwrap(), 5051);
        assert_eq!(port(&["--port".into(), "0".into()]).unwrap(), 0);
        assert_eq!(port(&["--port".into(), "5052".into()]).unwrap(), 5052);
        for args in [
            vec!["--port"],
            vec!["--port", "-1"],
            vec!["--port", "65536"],
            vec!["--port", "localhost"],
            vec!["--bind", "0.0.0.0"],
            vec!["--port", "5051", "extra"],
        ] {
            assert!(port(&args.into_iter().map(String::from).collect::<Vec<_>>()).is_err());
        }
    }
}
