use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{IpAddr, Ipv6Addr};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::CommandExt;
use std::process::{self, Command};

#[derive(Debug)]
struct Upstream {
    origin: String,
    host: String,
    authority: String,
}

fn numeric_port(value: &str) -> Result<u16, String> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("port must contain only decimal digits".into());
    }
    match value.parse::<u16>() {
        Ok(port) if port > 0 => Ok(port),
        _ => Err("port must be between 1 and 65535".into()),
    }
}

fn parse_port(value: Option<&str>) -> Result<u16, String> {
    value.map_or(Ok(8080), numeric_port)
}

fn valid_host(host: &str) -> bool {
    if host.parse::<IpAddr>().is_ok() {
        return true;
    }
    if host
        .bytes()
        .all(|byte| byte.is_ascii_digit() || byte == b'.')
    {
        return false;
    }
    !host.is_empty()
        && host.len() <= 253
        && host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label.as_bytes()[0].is_ascii_alphanumeric()
                && label.as_bytes()[label.len() - 1].is_ascii_alphanumeric()
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
}

fn parse_upstream(value: Option<&str>) -> Result<Upstream, String> {
    let value = value.ok_or("API_UPSTREAM is required")?;
    let authority = value
        .strip_prefix("http://")
        .or_else(|| value.strip_prefix("https://"))
        .ok_or("API_UPSTREAM must be an http:// or https:// origin")?;
    if authority.is_empty()
        || authority
            .bytes()
            .any(|byte| !byte.is_ascii_alphanumeric() && !b".-:[]".contains(&byte))
    {
        return Err(
            "API_UPSTREAM must be an origin without credentials, path, query or fragment".into(),
        );
    }
    let host;
    if let Some(ipv6) = authority.strip_prefix('[') {
        let (address, rest) = ipv6
            .split_once(']')
            .ok_or("invalid bracketed IPv6 origin")?;
        address
            .parse::<Ipv6Addr>()
            .map_err(|_| "invalid IPv6 origin")?;
        if !rest.is_empty() {
            numeric_port(rest.strip_prefix(':').ok_or("invalid IPv6 port")?)?;
        }
        host = address;
    } else {
        let (address, port) = authority
            .split_once(':')
            .map_or((authority, None), |(a, p)| (a, Some(p)));
        if !valid_host(address) {
            return Err("invalid API_UPSTREAM DNS name or IPv4 address".into());
        }
        if let Some(port) = port {
            numeric_port(port)?;
        }
        host = address;
    }
    Ok(Upstream {
        origin: value.into(),
        host: host.into(),
        authority: authority.into(),
    })
}

fn parse_resolvers(source: &str) -> Result<String, String> {
    let mut resolvers = Vec::new();
    for line in source.lines() {
        let mut fields = line
            .split(['#', ';'])
            .next()
            .unwrap_or("")
            .split_whitespace();
        if fields.next() != Some("nameserver") {
            continue;
        }
        if let Some(address) = fields.next().and_then(|value| value.parse::<IpAddr>().ok()) {
            let value = match address {
                IpAddr::V4(ip) => ip.to_string(),
                IpAddr::V6(ip) => format!("[{ip}]"),
            };
            if !resolvers.contains(&value) {
                resolvers.push(value);
            }
        }
    }
    if resolvers.is_empty() {
        return Err("/etc/resolv.conf contains no valid IPv4/IPv6 nameservers".into());
    }
    Ok(resolvers.join(" "))
}

fn render_template(
    source: &str,
    upstream: &Upstream,
    port: u16,
    resolvers: &str,
) -> Result<String, String> {
    let port = port.to_string();
    let markers = [
        ("@@PORT@@", port.as_str()),
        ("@@API_UPSTREAM@@", upstream.origin.as_str()),
        ("@@API_HOST@@", upstream.host.as_str()),
        ("@@API_AUTHORITY@@", upstream.authority.as_str()),
        ("@@RESOLVERS@@", resolvers),
    ];
    let mut rendered = source.to_string();
    for (marker, value) in markers {
        if !rendered.contains(marker) {
            return Err(format!("missing configuration template marker {marker}"));
        }
        rendered = rendered.replace(marker, value);
    }
    if rendered.contains("@@") {
        return Err("unknown configuration template marker".into());
    }
    Ok(rendered)
}

fn run() -> Result<(), String> {
    let value =
        env::var("API_UPSTREAM").map_err(|_| "API_UPSTREAM is required and must be valid UTF-8")?;
    let upstream = parse_upstream(Some(&value))?;
    let port_value = match env::var("PORT") {
        Ok(value) => Some(value),
        Err(env::VarError::NotPresent) => None,
        Err(_) => return Err("PORT must be valid UTF-8".into()),
    };
    let port = parse_port(port_value.as_deref())?;
    let resolvers = parse_resolvers(
        &fs::read_to_string("/etc/resolv.conf")
            .map_err(|error| format!("read resolvers: {error}"))?,
    )?;
    let template = fs::read_to_string("/etc/nginx/nginx.conf.template")
        .map_err(|error| format!("read configuration template: {error}"))?;
    let config = render_template(&template, &upstream, port, &resolvers)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open("/tmp/nginx.conf")
        .map_err(|error| format!("write /tmp/nginx.conf: {error}"))?;
    file.write_all(config.as_bytes())
        .map_err(|error| format!("write configuration: {error}"))?;
    drop(file);
    let mut args: Vec<_> = env::args_os().skip(1).collect();
    if args
        .first()
        .is_some_and(|arg| arg == "nginx" || arg == "/nginx")
    {
        args.remove(0);
    }
    let error = Command::new("/nginx")
        .args(["-c", "/tmp/nginx.conf", "-g", "daemon off;"])
        .args(args)
        .exec();
    Err(format!("execute /nginx: {error}"))
}

fn main() {
    if let Err(error) = run() {
        eprintln!("auth-static-launcher: {error}");
        process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_origin_and_rejects_config_injection() {
        assert!(parse_upstream(None).is_err());
        for value in [
            "",
            "ftp://api.test",
            "HTTP://api.test",
            "http://user:pass@api.test",
            "http://api.test/route",
            "http://api.test?x=y",
            "http://api.test#frag",
            "http://api.test;include",
            "http://api.test\n}",
            "http://api.test ",
            "http://api.test:0",
            "http://api.test:65536",
            "http://api.test:abc",
            "http://-bad.test",
            "http://bad_.test",
            "http://256.0.0.1",
            "http://::1",
            "http://[::1]junk",
            "http://[::1%eth0]",
        ] {
            assert!(parse_upstream(Some(value)).is_err(), "accepted {value:?}");
        }
    }

    #[test]
    fn supports_dns_ipv4_ipv6_and_explicit_ports_without_dns_lookups() {
        for (value, host, authority) in [
            ("http://api-a:8081", "api-a", "api-a:8081"),
            (
                "https://api.example.test",
                "api.example.test",
                "api.example.test",
            ),
            ("http://127.0.0.1:80", "127.0.0.1", "127.0.0.1:80"),
            (
                "https://[2001:db8::1]:8443",
                "2001:db8::1",
                "[2001:db8::1]:8443",
            ),
        ] {
            let upstream = parse_upstream(Some(value)).unwrap();
            assert_eq!(upstream.origin, value);
            assert_eq!(upstream.host, host);
            assert_eq!(upstream.authority, authority);
        }
    }

    #[test]
    fn validates_port_and_default() {
        assert_eq!(parse_port(None).unwrap(), 8080);
        assert_eq!(parse_port(Some("9091")).unwrap(), 9091);
        assert_eq!(parse_port(Some("65535")).unwrap(), 65535);
        for value in ["", "0", "65536", "-1", "+80", " 80", "80\n", "80;", "8.0"] {
            assert!(parse_port(Some(value)).is_err(), "accepted {value:?}");
        }
    }

    #[test]
    fn reads_and_deduplicates_container_ipv4_ipv6_nameservers() {
        let input = "# ignored\nsearch internal\nnameserver 127.0.0.11\nnameserver 2001:db8::53 # local\nnameserver 127.0.0.11\noptions ndots:0\nnameserver bad;inject\n";
        assert_eq!(parse_resolvers(input).unwrap(), "127.0.0.11 [2001:db8::53]");
        assert!(parse_resolvers("search only\nnameserver invalid").is_err());
    }

    #[test]
    fn replaces_only_explicit_markers_and_keeps_nginx_variables() {
        let upstream = parse_upstream(Some("https://api.test:8443")).unwrap();
        let source = "@@PORT@@ @@API_UPSTREAM@@ @@API_HOST@@ @@API_AUTHORITY@@ @@RESOLVERS@@ $uri $request_uri ${selected_coding}";
        assert_eq!(render_template(source, &upstream, 8081, "127.0.0.11").unwrap(), "8081 https://api.test:8443 api.test api.test:8443 127.0.0.11 $uri $request_uri ${selected_coding}");
        assert!(render_template("@@UNKNOWN@@", &upstream, 8081, "127.0.0.11").is_err());
    }
}
