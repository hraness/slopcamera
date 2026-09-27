//! `install`, `uninstall`, `status` and `start` for the menu bar, on
//! desktop-foundation's shared LaunchAgent helper (`service`), plus the
//! single-instance lock every launch takes.
//!
//! Nothing here runs `launchctl`: the login item takes effect at the next
//! login, and `start` opens the menu bar now. The local `.app` identity from
//! desktop-foundation 0.8 is wired in but stays off unless
//! `HRANESS_LOCAL_APP=1`, until the clean-account check in
//! desktop-foundation's `docs/identity.md` has run.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};

use desktop_foundation::identity::{self, AppSpec, Environment, IdentityState, Signing, Tools};
use desktop_foundation::service::{
    self, Change, Glyphs, LaunchAgentPlan, LoginItem, LoginState, ServiceError, ServiceStatus,
};
use sha2::{Digest, Sha256};

/// One product's names.
#[derive(Debug, Clone, Copy)]
pub struct Product {
    /// Lowercase product ID, such as `aicharts`.
    pub app_id: &'static str,
    /// Display name, such as `AI Charts`.
    pub name: &'static str,
    /// The CLI people type for next steps, such as `aicharts`.
    pub command: &'static str,
    /// This binary's name, such as `aicharts-menubar`.
    pub binary: &'static str,
    pub version: &'static str,
}

/// The environment switch for the local `.app` identity. Off by default.
pub const LOCAL_APP_ENV: &str = "HRANESS_LOCAL_APP";

/// Who reads the output. TODO(df-0.8.1): use `hraness_cli_kit::audience`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Audience {
    Human,
    Agent,
    Quiet,
}

const AGENT_MARKERS: &[&str] = &[
    "AI_AGENT",
    "CLAUDECODE",
    "CODEX_SANDBOX",
    "CODEX_SANDBOX_NETWORK_DISABLED",
    "CURSOR_AGENT",
    "GEMINI_CLI",
];

/// The shared `detectAudience` rule (SPEC § C).
pub fn audience(env: &dyn Fn(&str) -> Option<String>, stderr_is_tty: bool) -> Audience {
    match env("HRANESS_AUDIENCE").as_deref() {
        Some("human") => return Audience::Human,
        Some("agent") => return Audience::Agent,
        Some("quiet") | Some("off") => return Audience::Quiet,
        _ => {}
    }
    if AGENT_MARKERS
        .iter()
        .any(|name| env(name).is_some_and(|value| !value.is_empty()))
    {
        return Audience::Agent;
    }
    if stderr_is_tty {
        Audience::Human
    } else {
        Audience::Quiet
    }
}

/// ASCII fallbacks for `TERM=dumb`, non-UTF-8 locales and `HRANESS_ASCII=1`.
pub fn glyphs(env: &dyn Fn(&str) -> Option<String>) -> Glyphs {
    let utf8 = ["LC_ALL", "LC_CTYPE", "LANG"].iter().any(|name| {
        env(name).is_some_and(|value| {
            let value = value.to_ascii_lowercase();
            value.contains("utf-8") || value.contains("utf8")
        })
    });
    if env("TERM").as_deref() == Some("dumb")
        || env("HRANESS_ASCII").as_deref() == Some("1")
        || !utf8
    {
        Glyphs::Ascii
    } else {
        Glyphs::Unicode
    }
}

fn process_env(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

fn stderr_is_tty() -> bool {
    use std::io::IsTerminal;
    std::io::stderr().is_terminal()
}

/// The folder for the lock file and other menu bar state.
pub fn state_dir(home: &Path, product: &Product) -> PathBuf {
    home.join("Library")
        .join("Application Support")
        .join(product.name)
}

/// What starts at login: this executable, or with `HRANESS_LOCAL_APP=1` the
/// product's local app, so Login Items shows the product's name.
pub fn login_item(product: &Product, program: PathBuf) -> LoginItem {
    LoginItem {
        app_id: product.app_id.to_owned(),
        name: product.name.to_owned(),
        command: product.command.to_owned(),
        program,
        args: Vec::new(),
        bundle_id: None,
    }
}

fn sha256_file(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(
        Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    )
}

/// Builds `~/Applications/Hraness/<Name>.app` around `executable` and
/// returns the login item that starts it. Never creates the signing
/// identity: it signs with it when it already exists, otherwise ad hoc.
pub fn local_app_login_item(
    product: &Product,
    executable: &Path,
    env: &Environment,
    usage: BTreeMap<String, String>,
) -> Result<LoginItem, identity::AppError> {
    let signing = match identity::signing_identity_status(env) {
        IdentityState::Ready { .. } => Signing::Local,
        _ => Signing::AdHoc,
    };
    let spec = AppSpec {
        app_id: product.app_id.to_owned(),
        name: product.name.to_owned(),
        product_version: product.version.to_owned(),
        executable: executable.to_owned(),
        executable_sha256: sha256_file(executable).ok_or(identity::AppError::InvalidAppRequest)?,
        icon_png: None,
        usage,
        helpers: Vec::new(),
        signing,
    };
    let build = identity::assemble_app(&spec, env, product.version)?;
    let app = build.path;
    Ok(LoginItem {
        app_id: product.app_id.to_owned(),
        name: product.name.to_owned(),
        command: product.command.to_owned(),
        program: app.join("Contents").join("MacOS").join(product.name),
        args: Vec::new(),
        bundle_id: Some(format!("app.hraness.{}", product.app_id)),
    })
}

/// Everything a lifecycle command reads, injectable for tests.
pub struct Context<'a> {
    pub product: Product,
    pub home: PathBuf,
    pub executable: PathBuf,
    pub env: &'a dyn Fn(&str) -> Option<String>,
    pub stderr_is_tty: bool,
    pub tools: &'a dyn Tools,
    pub usage: BTreeMap<String, String>,
}

impl Context<'_> {
    fn glyphs(&self) -> Glyphs {
        glyphs(self.env)
    }

    fn audience(&self) -> Audience {
        audience(self.env, self.stderr_is_tty)
    }

    fn local_app(&self) -> bool {
        (self.env)(LOCAL_APP_ENV).as_deref() == Some("1")
    }

    fn item(&self) -> Result<LoginItem, String> {
        if !self.local_app() {
            return Ok(login_item(&self.product, self.executable.clone()));
        }
        let env = Environment {
            home: self.home.clone(),
            keychain: self.home.join("Library/Keychains/login.keychain-db"),
            tools: self.tools,
            force_ad_hoc: (self.env)(identity::SIGNING_ENV).as_deref() == Some("ad-hoc"),
        };
        local_app_login_item(&self.product, &self.executable, &env, self.usage.clone()).map_err(
            |error| {
                let (fail, next) = match self.glyphs() {
                    Glyphs::Unicode => ("✗", "→"),
                    Glyphs::Ascii => ("FAIL", "->"),
                };
                format!(
                    "{fail} Couldn't build the {} app ({}).\n{next} unset {LOCAL_APP_ENV} and run {} menubar install again\n",
                    self.product.name,
                    error.code(),
                    self.product.command
                )
            },
        )
    }

    fn plan(&self, item: &LoginItem) -> Result<LaunchAgentPlan, ServiceError> {
        service::plan(item, &self.home)
    }
}

/// The result of one lifecycle command: stdout, stderr and the exit code.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

fn change_name(change: Change) -> &'static str {
    match change {
        Change::Created => "created",
        Change::Updated => "updated",
        Change::Unchanged => "unchanged",
        Change::Removed => "removed",
    }
}

fn login_name(state: LoginState) -> &'static str {
    match state {
        LoginState::On => "on",
        LoginState::Off => "off",
        LoginState::Outdated => "outdated",
        LoginState::NotOurs => "not-ours",
        LoginState::Unknown => "unknown",
    }
}

fn json_error(code: &str, message: &str, next: &str) -> String {
    serde_json::json!({ "ok": false, "error": { "code": code, "message": message, "next": next } })
        .to_string()
        + "\n"
}

fn service_error_code(error: ServiceError) -> &'static str {
    match error.kind {
        service::ServiceErrorKind::InvalidItem => "invalid-item",
        service::ServiceErrorKind::NotOurs => "not-ours",
        service::ServiceErrorKind::Unwritable => "unwritable",
        service::ServiceErrorKind::Unsupported => "unsupported",
    }
}

fn failure(ctx: &Context, item: &LoginItem, error: ServiceError, json: bool) -> Outcome {
    let human = service::error_message(item, error, ctx.glyphs());
    if json || ctx.audience() == Audience::Agent {
        let message = human
            .lines()
            .next()
            .unwrap_or("")
            .trim_start_matches(['✗', ' '])
            .trim_start_matches("FAIL ")
            .to_owned();
        return Outcome {
            stdout: json_error(
                service_error_code(error),
                &message,
                &format!("{} menubar status", ctx.product.command),
            ),
            code: 1,
            ..Outcome::default()
        };
    }
    Outcome {
        stderr: human,
        code: 1,
        ..Outcome::default()
    }
}

/// `install`: prints the login item notice, then writes the LaunchAgent.
pub fn install(ctx: &Context, json: bool) -> Outcome {
    let item = match ctx.item() {
        Ok(item) => item,
        Err(message) => {
            return Outcome {
                stderr: message,
                code: 1,
                ..Outcome::default()
            }
        }
    };
    let mut out = Outcome::default();
    let requester = if item.bundle_id.is_some() {
        ctx.product.name.to_owned()
    } else {
        item.program
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| ctx.product.binary.to_owned())
    };
    match ctx.audience() {
        Audience::Human if !json => {
            out.stderr = service::login_item_notice(ctx.product.name, &requester, ctx.glyphs());
        }
        Audience::Agent => {
            let notice = service::login_item_notice(ctx.product.name, &requester, Glyphs::Unicode);
            let message = notice
                .lines()
                .map(|line| line.trim().trim_start_matches("🔐").trim())
                .collect::<Vec<_>>()
                .join(" ");
            out.stderr = serde_json::json!({
                "type": "permission-notice",
                "product": ctx.product.name,
                "kind": "login-item",
                "message": message,
            })
            .to_string()
                + "\n";
        }
        _ => {}
    }
    let plan = match ctx.plan(&item) {
        Ok(plan) => plan,
        Err(error) => {
            let failed = failure(ctx, &item, error, json);
            return Outcome {
                stderr: out.stderr + &failed.stderr,
                ..failed
            };
        }
    };
    match service::install(&plan) {
        Ok(change) => {
            if json || ctx.audience() == Audience::Agent {
                out.stdout = serde_json::json!({
                    "ok": true,
                    "change": change_name(change),
                    "login": "on",
                    "next": format!("{} menubar start", ctx.product.command),
                })
                .to_string()
                    + "\n";
            } else {
                out.stdout = service::install_result(&item, change, ctx.glyphs());
            }
            out
        }
        Err(error) => {
            let failed = failure(ctx, &item, error, json);
            Outcome {
                stderr: out.stderr + &failed.stderr,
                ..failed
            }
        }
    }
}

/// `uninstall`: removes the LaunchAgent when it is ours.
pub fn uninstall(ctx: &Context, json: bool) -> Outcome {
    // Uninstall targets the plain login item; the label is the same either way.
    let item = login_item(&ctx.product, ctx.executable.clone());
    let plan = match ctx.plan(&item) {
        Ok(plan) => plan,
        Err(error) => return failure(ctx, &item, error, json),
    };
    match service::uninstall(&plan) {
        Ok(change) if json || ctx.audience() == Audience::Agent => Outcome {
            stdout: serde_json::json!({ "ok": true, "change": change_name(change), "login": "off" })
                .to_string() + "\n",
            ..Outcome::default()
        },
        Ok(change) => Outcome {
            stdout: service::uninstall_result(&item, change, ctx.glyphs()),
            ..Outcome::default()
        },
        Err(error) => failure(ctx, &item, error, json),
    }
}

/// `status`: whether the menu bar runs and opens at login.
pub fn status(ctx: &Context, json: bool) -> Outcome {
    let item = login_item(&ctx.product, ctx.executable.clone());
    let plan = match ctx.plan(&item) {
        Ok(plan) => plan,
        Err(error) => return failure(ctx, &item, error, json),
    };
    let state_dir = state_dir(&ctx.home, &ctx.product);
    let mut status = ServiceStatus::read(&plan, &state_dir, ctx.product.app_id);
    // A LaunchAgent that starts the local app is ours too.
    if status.login == LoginState::Outdated || status.login == LoginState::NotOurs {
        if let Ok(app_item) = ctx.item() {
            if let Ok(app_plan) = ctx.plan(&app_item) {
                let app_state = service::login_state(&app_plan);
                if app_state == LoginState::On {
                    status.login = LoginState::On;
                }
            }
        }
    }
    if json || ctx.audience() == Audience::Agent {
        return Outcome {
            stdout: serde_json::json!({
                "name": ctx.product.name,
                "running": status.running,
                "login": login_name(status.login),
            })
            .to_string()
                + "\n",
            ..Outcome::default()
        };
    }
    Outcome {
        stdout: status.human(&item, ctx.glyphs()),
        ..Outcome::default()
    }
}

/// The line `start` and a second launch print when a copy already runs.
pub fn already_running(product: &Product, glyphs: Glyphs) -> String {
    let ok = match glyphs {
        Glyphs::Unicode => "✓",
        Glyphs::Ascii => "OK",
    };
    format!("{ok} {} is already in your menu bar\n", product.name)
}

/// `start`: opens the menu bar now, in the background.
pub fn start(ctx: &Context, spawn: &mut dyn FnMut(&Path) -> std::io::Result<()>) -> Outcome {
    let state_dir = state_dir(&ctx.home, &ctx.product);
    let glyphs = ctx.glyphs();
    if service::is_running(&state_dir, ctx.product.app_id) == Some(true) {
        return Outcome {
            stdout: already_running(&ctx.product, glyphs),
            ..Outcome::default()
        };
    }
    let (ok, fail, next) = match glyphs {
        Glyphs::Unicode => ("✓", "✗", "→"),
        Glyphs::Ascii => ("OK", "FAIL", "->"),
    };
    match spawn(&ctx.executable) {
        Ok(()) => Outcome {
            stdout: format!("{ok} {} is in your menu bar\n", ctx.product.name),
            ..Outcome::default()
        },
        Err(_) => Outcome {
            stderr: format!(
                "{fail} {} couldn't open its menu bar.\n{next} {} menubar status\n",
                ctx.product.name, ctx.product.command
            ),
            code: 1,
            ..Outcome::default()
        },
    }
}

/// Starts `executable` detached from this terminal.
pub fn spawn_detached(executable: &Path) -> std::io::Result<()> {
    std::process::Command::new(executable)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
}

pub fn usage(product: &Product) -> String {
    format!(
        "Usage: {binary} [install | uninstall | status | start] [--json]

Show {name} in the menu bar. With no command it runs in this terminal.

Commands
  install      Open {name} at login
  uninstall    Stop opening {name} at login
  status       Check whether {name} runs and opens at login
  start        Open {name} in the menu bar now

Options
  --json         Print machine-readable output
  -h, --help     Show this help
  -V, --version  Show the version
",
        binary = product.binary,
        name = product.name
    )
}

/// Parses lifecycle arguments. `None` means "run the menu bar".
pub enum Command {
    Run,
    Install { json: bool },
    Uninstall { json: bool },
    Status { json: bool },
    Start,
    Help,
    Version,
    Usage(String),
}

pub fn parse(args: &[String]) -> Command {
    let json = args.iter().any(|arg| arg == "--json");
    let rest: Vec<&str> = args
        .iter()
        .map(String::as_str)
        .filter(|arg| *arg != "--json")
        .collect();
    match rest.as_slice() {
        [] | ["run"] => Command::Run,
        ["install"] => Command::Install { json },
        ["uninstall"] => Command::Uninstall { json },
        ["status"] => Command::Status { json },
        ["start"] => Command::Start,
        ["-h"] | ["--help"] | ["help"] | [_, "--help"] | [_, "-h"] => Command::Help,
        ["-V"] | ["--version"] => Command::Version,
        // Launchers pass `--outputs <dir>` through to the menu bar itself.
        ["--outputs", _] => Command::Run,
        [other, ..] => Command::Usage((*other).to_owned()),
    }
}

/// Runs a lifecycle command against the real home folder and prints the
/// result. Returns the exit code, or `None` when the menu bar should run.
pub fn main(
    product: Product,
    args: &[String],
    usage_descriptions: BTreeMap<String, String>,
) -> Option<i32> {
    let command = parse(args);
    let glyph_set = glyphs(&process_env);
    let print = |outcome: Outcome| -> i32 {
        let _ = std::io::stdout().write_all(outcome.stdout.as_bytes());
        let _ = std::io::stderr().write_all(outcome.stderr.as_bytes());
        outcome.code
    };
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let executable = std::env::current_exe().ok();
    let context = |home: PathBuf, executable: PathBuf| Context {
        product,
        home,
        executable,
        env: &process_env,
        stderr_is_tty: stderr_is_tty(),
        tools: &identity::SystemTools,
        usage: usage_descriptions.clone(),
    };
    let needs_home = !matches!(
        command,
        Command::Run | Command::Help | Command::Version | Command::Usage(_)
    );
    let (home, executable) = match (home, executable) {
        (Some(home), Some(executable)) if home.is_absolute() => (home, executable),
        _ if needs_home => {
            let (fail, next) = match glyph_set {
                Glyphs::Unicode => ("✗", "→"),
                Glyphs::Ascii => ("FAIL", "->"),
            };
            eprintln!(
                "{fail} Couldn't find your home folder.\n{next} {} --help",
                product.binary
            );
            return Some(1);
        }
        _ => (PathBuf::from("/"), PathBuf::from(product.binary)),
    };
    match command {
        Command::Run => None,
        Command::Install { json } => Some(print(install(&context(home, executable), json))),
        Command::Uninstall { json } => Some(print(uninstall(&context(home, executable), json))),
        Command::Status { json } => Some(print(status(&context(home, executable), json))),
        Command::Start => Some(print(start(
            &context(home, executable),
            &mut spawn_detached,
        ))),
        Command::Help => {
            print!("{}", usage(&product));
            Some(0)
        }
        Command::Version => {
            println!("{} {}", product.binary, product.version);
            Some(0)
        }
        Command::Usage(other) => {
            let (fail, next) = match glyph_set {
                Glyphs::Unicode => ("✗", "→"),
                Glyphs::Ascii => ("FAIL", "->"),
            };
            eprintln!(
                "{fail} Unknown command \"{other}\".\n{next} {} --help",
                product.binary
            );
            Some(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::process::Output;

    const PRODUCT: Product = Product {
        app_id: "testproduct",
        name: "Test Product",
        command: "testproduct",
        binary: "testproduct-menubar",
        version: "1.2.3",
    };

    struct NoTools;
    impl Tools for NoTools {
        fn run(&self, _program: &str, _args: &[OsString]) -> std::io::Result<Output> {
            Err(std::io::Error::other("no tools in tests"))
        }
    }

    fn temp_home(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lifecycle-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn human_env(name: &str) -> Option<String> {
        match name {
            "LANG" => Some("en_US.UTF-8".into()),
            "HRANESS_AUDIENCE" => Some("human".into()),
            _ => None,
        }
    }

    fn agent_env(name: &str) -> Option<String> {
        match name {
            "LANG" => Some("en_US.UTF-8".into()),
            "CLAUDECODE" => Some("1".into()),
            _ => None,
        }
    }

    fn ctx<'a>(home: &Path, env: &'a dyn Fn(&str) -> Option<String>) -> Context<'a> {
        Context {
            product: PRODUCT,
            home: home.to_owned(),
            executable: home.join("bin").join("testproduct-menubar"),
            env,
            stderr_is_tty: true,
            tools: &NoTools,
            usage: BTreeMap::new(),
        }
    }

    #[test]
    fn audience_follows_the_shared_rule() {
        let none = |_: &str| None;
        assert_eq!(audience(&none, true), Audience::Human);
        assert_eq!(audience(&none, false), Audience::Quiet);
        let prefix = |name: &str| (name == "CODEX_HOME").then(|| "x".to_owned());
        assert_eq!(audience(&prefix, true), Audience::Human);
        assert_eq!(audience(&agent_env, true), Audience::Agent);
        let forced = |name: &str| (name == "HRANESS_AUDIENCE").then(|| "off".to_owned());
        assert_eq!(audience(&forced, true), Audience::Quiet);
    }

    #[test]
    fn glyphs_fall_back_to_ascii() {
        assert_eq!(glyphs(&human_env), Glyphs::Unicode);
        let dumb = |name: &str| match name {
            "TERM" => Some("dumb".to_owned()),
            other => human_env(other),
        };
        assert_eq!(glyphs(&dumb), Glyphs::Ascii);
        assert_eq!(glyphs(&|_| None), Glyphs::Ascii);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn install_prints_the_notice_then_writes_one_owned_plist() {
        let home = temp_home("install");
        let context = ctx(&home, &human_env);
        let outcome = install(&context, false);
        assert_eq!(outcome.code, 0, "{outcome:?}");
        assert_eq!(
            outcome.stderr,
            "🔐 macOS will show a notice that testproduct-menubar can open at login. That's Test Product's menu bar.\n   Its menu bar icon opens when you log in. Nothing else runs in the background. Turn it off any time in System Settings › General › Login Items & Extensions.\n"
        );
        assert_eq!(
            outcome.stdout,
            "✓ Test Product will open at login\n→ testproduct menubar start to open it now\n"
        );
        let plist = home.join("Library/LaunchAgents/app.hraness.testproduct.plist");
        let text = std::fs::read_to_string(&plist).unwrap();
        assert!(text.contains("<string>app.hraness.testproduct</string>"));
        assert!(!text.contains("launchctl"));
        // Installing again changes nothing.
        let again = install(&context, false);
        assert_eq!(again.stdout, "✓ Test Product already opens at login\n");
        let status_text = status(&context, false);
        assert_eq!(
            status_text.stdout,
            "○ Test Product isn't in your menu bar\n✓ Opens at login\n→ testproduct menubar start\n"
        );
        let removed = uninstall(&context, false);
        assert_eq!(
            removed.stdout,
            "✓ Test Product won't open at login. Quit it from its menu when you're done.\n"
        );
        assert!(!plist.exists());
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn agents_get_json_and_a_notice_line() {
        let home = temp_home("agent");
        let context = ctx(&home, &agent_env);
        let outcome = install(&context, false);
        assert_eq!(outcome.code, 0);
        let notice: serde_json::Value = serde_json::from_str(outcome.stderr.trim()).unwrap();
        assert_eq!(notice["type"], "permission-notice");
        assert_eq!(notice["kind"], "login-item");
        let result: serde_json::Value = serde_json::from_str(outcome.stdout.trim()).unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["change"], "created");
        let state: serde_json::Value =
            serde_json::from_str(status(&context, false).stdout.trim()).unwrap();
        assert_eq!(state["login"], "on");
        assert_eq!(state["running"], false);
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn a_login_item_someone_else_wrote_is_left_alone() {
        let home = temp_home("notours");
        let agents = home.join("Library/LaunchAgents");
        std::fs::create_dir_all(&agents).unwrap();
        let plist = agents.join("app.hraness.testproduct.plist");
        std::fs::write(&plist, "<plist>hand written</plist>\n").unwrap();
        let context = ctx(&home, &human_env);
        let outcome = uninstall(&context, false);
        assert_eq!(outcome.code, 1);
        assert!(outcome.stderr.starts_with(
            "✗ Test Product's login item was changed outside testproduct, so it was left alone.\n"
        ));
        assert_eq!(
            std::fs::read_to_string(&plist).unwrap(),
            "<plist>hand written</plist>\n"
        );
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn start_reports_a_running_copy_without_spawning() {
        let home = temp_home("start");
        let context = ctx(&home, &human_env);
        let dir = state_dir(&home, &PRODUCT);
        let _lock = service::InstanceLock::acquire(&dir, PRODUCT.app_id)
            .unwrap()
            .unwrap();
        let mut spawned = false;
        let outcome = start(&context, &mut |_| {
            spawned = true;
            Ok(())
        });
        assert!(!spawned);
        assert_eq!(
            outcome.stdout,
            "✓ Test Product is already in your menu bar\n"
        );
        drop(_lock);
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn start_spawns_when_nothing_runs() {
        let home = temp_home("spawn");
        let context = ctx(&home, &human_env);
        let mut spawned = None;
        let outcome = start(&context, &mut |path| {
            spawned = Some(path.to_owned());
            Ok(())
        });
        assert_eq!(spawned.as_deref(), Some(context.executable.as_path()));
        assert_eq!(outcome.stdout, "✓ Test Product is in your menu bar\n");
        let failed = start(&context, &mut |_| Err(std::io::Error::other("no")));
        assert_eq!(failed.code, 1);
        assert_eq!(
            failed.stderr,
            "✗ Test Product couldn't open its menu bar.\n→ testproduct menubar status\n"
        );
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn local_app_stays_off_by_default() {
        let home = temp_home("appoff");
        let context = ctx(&home, &human_env);
        let item = context.item().unwrap();
        assert_eq!(item.program, context.executable);
        assert_eq!(item.bundle_id, None);
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn local_app_switch_reports_a_build_failure_plainly() {
        let home = temp_home("appon");
        let env = |name: &str| match name {
            LOCAL_APP_ENV => Some("1".to_owned()),
            other => human_env(other),
        };
        let context = ctx(&home, &env);
        // The executable does not exist, so assembly refuses before any tool runs.
        let message = context.item().unwrap_err();
        assert_eq!(
            message,
            "✗ Couldn't build the Test Product app (invalid-app-request).\n→ unset HRANESS_LOCAL_APP and run testproduct menubar install again\n"
        );
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn parse_keeps_run_as_the_default() {
        assert!(matches!(parse(&[]), Command::Run));
        assert!(matches!(
            parse(&["--outputs".into(), "/x".into()]),
            Command::Run
        ));
        assert!(matches!(
            parse(&["status".into(), "--json".into()]),
            Command::Status { json: true }
        ));
        assert!(matches!(
            parse(&["install".into(), "--help".into()]),
            Command::Help
        ));
        assert!(matches!(parse(&["stauts".into()]), Command::Usage(ref s) if s == "stauts"));
    }
}
