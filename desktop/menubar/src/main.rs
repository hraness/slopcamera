//! `slopcamera-menubar`: the Slopcamera menu bar.
//!
//! It shows what Slopcamera is doing (a render in progress, the last job's
//! result) and your last known credits balance, and lists the newest
//! outputs so you can open a result straight from the menu bar. It holds no
//! authority: it reads the CLI's status file and the outputs folder.
//!
//! `slopcamera-menubar install | uninstall | status | start` manage the
//! login item through desktop-foundation's shared helper;
//! `slopcamera menubar …` runs the same commands.

mod lifecycle;
mod menu;
#[cfg(test)]
mod menu_fixture;
mod status;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use desktop_foundation::browser::{BrowserOpener, BrowserStatus};
use desktop_foundation::outputs::OutputsSection;
use desktop_foundation::service::{self, InstanceLock, LoginState};
use desktop_foundation::{DispatchOutcome, Host, MenuModel, Options, RenderError};

use lifecycle::Product;
use status::Status;

const PRODUCT: Product = Product {
    app_id: menu::APP_ID,
    name: menu::NAME,
    command: "slopcamera",
    binary: "slopcamera-menubar",
    version: env!("CARGO_PKG_VERSION"),
};

const SUPPORT_URL: &str = "https://account.hraness.com/support?product=slopcamera&source=desktop";
const ACTION_ERROR_SECONDS: u64 = 60;

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

/// `~/Library/Application Support/Slopcamera` on macOS, mirroring
/// `defaultCliStateRoot` in `apps/desktop/cli/paths.ts`; XDG state elsewhere.
fn product_root(home: &std::path::Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/Slopcamera")
    } else if let Some(state) = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
    {
        state.join("slopcamera")
    } else {
        home.join(".local/state/slopcamera")
    }
}

struct SlopcameraHost {
    outputs: OutputsSection,
    browser: BrowserOpener,
    /// The CLI state folder, where `menubar-status.json` lives.
    cli_root: Option<PathBuf>,
    home: Option<PathBuf>,
    executable: Option<PathBuf>,
    action_error: Mutex<Option<(String, Instant)>>,
}

impl SlopcameraHost {
    fn status(&self) -> Option<Status> {
        self.cli_root.as_deref().and_then(Status::read)
    }

    fn login_plan(&self) -> Option<service::LaunchAgentPlan> {
        let item = lifecycle::login_item(&PRODUCT, self.executable.clone()?);
        service::plan(&item, self.home.as_deref()?).ok()
    }

    fn login(&self) -> menu::Login {
        match self.login_plan().map(|plan| service::login_state(&plan)) {
            Some(LoginState::On) => menu::Login::On,
            Some(LoginState::Outdated) => menu::Login::Outdated,
            Some(LoginState::NotOurs) => menu::Login::NotOurs,
            _ => menu::Login::Off,
        }
    }

    fn fail(&self, message: &str) -> DispatchOutcome {
        *self
            .action_error
            .lock()
            .unwrap_or_else(|error| error.into_inner()) =
            Some((message.to_owned(), Instant::now()));
        DispatchOutcome::Rejected
    }

    fn current_action_error(&self) -> Option<String> {
        if let BrowserStatus::Failed(_) = self.browser.status() {
            return Some("Couldn't open your browser".to_owned());
        }
        let mut slot = self
            .action_error
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        match slot.as_ref() {
            Some((message, when)) if when.elapsed() < Duration::from_secs(ACTION_ERROR_SECONDS) => {
                Some(message.clone())
            }
            _ => {
                *slot = None;
                None
            }
        }
    }

    fn copy_diagnostics(&self) -> DispatchOutcome {
        let text = menu::diagnostics(self.status().as_ref(), PRODUCT.version, SystemTime::now());
        let child = std::process::Command::new("/usr/bin/pbcopy")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        let Ok(mut child) = child else {
            return self.fail("Couldn't copy diagnostics");
        };
        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            let _ = stdin.write_all(text.as_bytes());
        }
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        DispatchOutcome::Accepted
    }

    fn toggle_login(&self) -> DispatchOutcome {
        let Some(plan) = self.login_plan() else {
            return self.fail("Couldn't change Open at login");
        };
        let result = match self.login() {
            menu::Login::On => service::uninstall(&plan),
            // Install repoints an outdated item; a changed one is refused.
            menu::Login::Off | menu::Login::Outdated | menu::Login::NotOurs => {
                service::install(&plan)
            }
        };
        match result {
            Ok(_) => DispatchOutcome::Accepted,
            Err(_) => self.fail("Couldn't change Open at login"),
        }
    }
}

impl Host for SlopcameraHost {
    fn snapshot(&self) -> MenuModel {
        let status = self.status();
        let action_error = self.current_action_error();
        menu::build(menu::View {
            status: status.as_ref(),
            outputs: self.outputs.nodes(),
            login: self.login(),
            action_error: action_error.as_deref(),
            now: SystemTime::now(),
        })
    }

    fn dispatch_result(&self, id: &str) -> DispatchOutcome {
        match id {
            menu::SUPPORT => match self.browser.open(SUPPORT_URL) {
                Ok(()) => DispatchOutcome::Accepted,
                Err(_) => self.fail("Couldn't open your browser"),
            },
            menu::DIAGNOSTICS => self.copy_diagnostics(),
            menu::LOGIN => self.toggle_login(),
            _ if self.outputs.dispatch(id) => DispatchOutcome::Accepted,
            _ => DispatchOutcome::Rejected,
        }
    }

    fn render_failed(&self, error: RenderError) {
        eprintln!("slopcamera-menubar: render failed: {error:?}");
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|home| home.is_absolute());
    // `--print-outputs` resolves the outputs folder for CLI and dev checks.
    if args.first().map(String::as_str) == Some("--print-outputs") {
        let Some(home) = home else {
            eprintln!("✗ Couldn't find your home folder.\n→ slopcamera-menubar --help");
            std::process::exit(2);
        };
        let outputs = product_root(&home).join("outputs");
        let _ = std::fs::create_dir_all(&outputs);
        println!("{}", outputs.display());
        return;
    }
    if let Some(code) = lifecycle::main(PRODUCT, &args, BTreeMap::new()) {
        std::process::exit(code);
    }
    let Some(home) = home else {
        eprintln!("✗ Couldn't find your home folder.\n→ slopcamera-menubar --help");
        std::process::exit(2);
    };
    let glyphs = lifecycle::glyphs(&env);
    let root = product_root(&home);
    let _instance =
        match InstanceLock::acquire(&lifecycle::state_dir(&home, &PRODUCT), PRODUCT.app_id) {
            Ok(Some(lock)) => Some(lock),
            Ok(None) => {
                eprint!("{}", lifecycle::already_running(&PRODUCT, glyphs));
                std::process::exit(service::EXIT_ALREADY_RUNNING);
            }
            Err(_) => None,
        };
    let outputs = OutputsSection::new(root.join("outputs")).with_limit(menu::OUTPUTS_LIMIT);
    let _ = std::fs::create_dir_all(outputs.dir());
    let host = Arc::new(SlopcameraHost {
        outputs,
        browser: BrowserOpener::new(),
        cli_root: Some(root.join("cli")),
        home: Some(home),
        executable: std::env::current_exe().ok(),
        action_error: Mutex::new(None),
    });
    let options = Options {
        refresh: Duration::from_secs(3),
        companion_window: false,
    };
    if let Err(error) = desktop_foundation::run(tauri::generate_context!(), host, options, |b| b) {
        eprintln!("slopcamera-menubar: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::status::{Activity, Credits};
    use std::time::UNIX_EPOCH;

    const NOW_MS: u64 = 1_790_000_000_000;

    fn now() -> SystemTime {
        UNIX_EPOCH + Duration::from_millis(NOW_MS)
    }

    fn activity(state: &str, ago_s: u64, error: Option<&str>) -> Activity {
        Activity {
            state: state.into(),
            label: "Rendering a recording".into(),
            started_at: NOW_MS - ago_s * 1000,
            finished_at: (state != "running").then_some(NOW_MS - ago_s * 1000 + 30_000),
            error: error.map(str::to_owned),
        }
    }

    fn credits(usd: &str, low: bool) -> Credits {
        Credits {
            usd: usd.into(),
            low,
            checked_at: NOW_MS - 7_300_000,
        }
    }

    fn outputs(count: usize) -> (Vec<desktop_foundation::MenuNode>, PathBuf) {
        static SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "slopcamera-menubar-outputs-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        for index in 0..count {
            std::fs::write(dir.join(format!("take {index}.mp4")), vec![b'x'; 4096]).unwrap();
            std::thread::sleep(Duration::from_millis(15));
        }
        let nodes = OutputsSection::new(&dir)
            .with_limit(menu::OUTPUTS_LIMIT)
            .nodes();
        (nodes, dir)
    }

    fn fixture(
        state: &str,
        status: Option<Status>,
        count: usize,
        login: menu::Login,
        action_error: Option<&str>,
    ) {
        let (outputs, dir) = outputs(count);
        let model = menu::build(menu::View {
            status: status.as_ref(),
            outputs,
            login,
            action_error,
            now: now(),
        });
        menu_fixture::check(state, &model, menu::APP_ID, menu::NAME);
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn status(activity: Option<Activity>, credits: Option<Credits>) -> Option<Status> {
        Some(Status {
            schema_version: 1,
            activity,
            credits,
        })
    }

    #[test]
    fn menu_first_run() {
        fixture("first-run", None, 0, menu::Login::Off, None);
    }

    #[test]
    fn menu_rendering() {
        fixture(
            "rendering",
            status(
                Some(activity("running", 90, None)),
                Some(credits("$4.20", false)),
            ),
            2,
            menu::Login::On,
            None,
        );
    }

    #[test]
    fn menu_ready() {
        fixture(
            "ready",
            status(
                Some(activity("done", 600, None)),
                Some(credits("$4.20", false)),
            ),
            5,
            menu::Login::On,
            None,
        );
    }

    #[test]
    fn menu_error() {
        fixture(
            "error",
            status(Some(activity("failed", 600, Some("subprocess"))), None),
            1,
            menu::Login::On,
            None,
        );
    }

    #[test]
    fn menu_low_credits() {
        fixture(
            "low-credits",
            status(
                Some(activity("done", 600, None)),
                Some(credits("$0.40", true)),
            ),
            1,
            menu::Login::On,
            None,
        );
    }

    #[test]
    fn menu_stale_job() {
        fixture(
            "stale-job",
            status(Some(activity("running", 8 * 3600, None)), None),
            0,
            menu::Login::Off,
            None,
        );
    }

    #[test]
    fn menu_empty() {
        fixture("empty", status(None, None), 0, menu::Login::On, None);
    }

    #[test]
    fn menu_action_error() {
        fixture(
            "action-error",
            status(
                Some(activity("done", 600, None)),
                Some(credits("$4.20", false)),
            ),
            5,
            menu::Login::On,
            Some("Couldn't open your browser"),
        );
    }

    #[test]
    fn menu_login_changed_elsewhere() {
        fixture("login-not-ours", None, 0, menu::Login::NotOurs, None);
    }

    #[test]
    fn worst_case_stays_within_ten_rows() {
        let (outputs, dir) = outputs(9);
        let status = status(
            Some(activity("failed", 60, Some("subprocess"))),
            Some(credits("$0.10", true)),
        );
        let model = menu::build(menu::View {
            status: status.as_ref(),
            outputs,
            login: menu::Login::On,
            action_error: None,
            now: now(),
        });
        let rows = model
            .nodes
            .iter()
            .filter(|node| {
                !matches!(
                    node,
                    desktop_foundation::MenuNode::Separator
                        | desktop_foundation::MenuNode::Header { .. }
                )
            })
            .count();
        assert!(rows <= 10, "{rows} rows");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn unknown_actions_are_rejected_without_opening_anything() {
        let host = SlopcameraHost {
            outputs: OutputsSection::new("/dev/null/absent-outputs"),
            browser: BrowserOpener::new(),
            cli_root: None,
            home: None,
            executable: None,
            action_error: Mutex::new(None),
        };
        assert!(matches!(
            host.dispatch_result("unknown.action"),
            DispatchOutcome::Rejected
        ));
        assert_eq!(host.browser.status(), BrowserStatus::Idle);
        assert!(matches!(
            host.dispatch_result(menu::LOGIN),
            DispatchOutcome::Rejected
        ));
        assert_eq!(
            host.current_action_error().as_deref(),
            Some("Couldn't change Open at login")
        );
    }

    #[test]
    fn diagnostics_carry_state_but_no_paths() {
        let status = status(
            Some(activity("failed", 60, Some("subprocess"))),
            Some(credits("$0.10", true)),
        );
        let text = menu::diagnostics(status.as_ref(), "0.2.0", now());
        assert!(text.contains("subprocess"));
        assert!(text.contains("$0.10, low"));
        assert!(!text.contains('/'));
    }
}
