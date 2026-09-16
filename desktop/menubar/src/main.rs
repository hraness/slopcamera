//! `slopcamera-menubar` — the Slopcamera menu-bar companion.
//!
//! Slopcamera's interface is a directory: agents drop finished outputs into
//! the per-user outputs root and the status item renders them newest-first,
//! with image thumbnails, so a user can open a result straight from the menu
//! bar. The binary holds no authority of its own — it only reads that
//! directory.
//!
//! Runs unbundled: `slopcamera menubar` spawns this executable directly.

use std::fs::{File, OpenOptions};
use std::os::unix::io::AsRawFd;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use desktop_foundation::outputs::OutputsSection;
use desktop_foundation::browser::{BrowserOpener, BrowserStatus};
use desktop_foundation::{
    AccessibilityMetadata, DispatchOutcome, Host, MenuItem, MenuModel, MenuNode, Options,
    RenderError, RgbaIcon,
};

const SUPPORT_URL: &str = "https://account.hraness.com/support?product=slopcamera&source=desktop#support";

/// Camera status mark. macOS renders `MARK_TITLE` as native colored emoji
/// text; icon-only trays use this pre-rendered 32px Twemoji bitmap
/// (U+1F4F7, CC-BY 4.0 — https://twemoji.twitter.com).
const MARK_TITLE: &str = "\u{1f4f7}";
fn mark_icon() -> RgbaIcon {
    RgbaIcon {
        rgba: include_bytes!("../icons/mark.rgba").to_vec(),
        width: 32,
        height: 32,
    }
}

/// `~/Library/Application Support/Slopcamera` on macOS, mirroring
/// `defaultCliStateRoot` in `apps/desktop/cli/paths.ts`; XDG state elsewhere.
fn product_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    if cfg!(target_os = "macos") {
        Some(home.join("Library/Application Support/Slopcamera"))
    } else if let Some(state) = std::env::var_os("XDG_STATE_HOME") {
        Some(PathBuf::from(state).join("slopcamera"))
    } else {
        Some(home.join(".local/state/slopcamera"))
    }
}

struct SlopcameraHost {
    outputs: OutputsSection,
    browser: BrowserOpener,
}

impl Host for SlopcameraHost {
    fn snapshot(&self) -> MenuModel {
        let mut nodes = vec![
            MenuNode::disabled("Slopcamera Outputs"),
            MenuNode::Separator,
        ];
        nodes.extend(self.outputs.nodes());
        nodes.push(MenuNode::Separator);
        nodes.push(MenuNode::item("product.support", "Support Slopcamera development (optional paid)…"));
        if matches!(self.browser.status(), BrowserStatus::Failed(_)) {
            nodes.push(MenuNode::disabled("Browser unavailable — use account.hraness.com"));
        }
        nodes.push(MenuNode::Separator);
        nodes.push(MenuNode::interactive(
            MenuItem::action(desktop_foundation::QUIT_ACTION_ID, "Quit Slopcamera")
                .with_shortcut("CmdOrCtrl+Q")
                .with_accessibility(AccessibilityMetadata {
                    label: Some("Quit Slopcamera".to_owned()),
                    value: None,
                    hint: Some("Exit the Slopcamera menu bar companion".to_owned()),
                }),
        ));
        let mut model = MenuModel {
            tooltip: Some("Slopcamera — agent outputs".to_owned()),
            nodes,
            ..MenuModel::default()
        };
        model.mark(MARK_TITLE, Some(mark_icon()));
        model
    }

    fn dispatch_result(&self, id: &str) -> DispatchOutcome {
        if id == "product.support" {
            return if self.browser.open(SUPPORT_URL).is_ok() { DispatchOutcome::Accepted } else { DispatchOutcome::Rejected };
        }
        if self.outputs.dispatch(id) {
            DispatchOutcome::Accepted
        } else {
            DispatchOutcome::Rejected
        }
    }

    fn render_failed(&self, error: RenderError) {
        eprintln!("slopcamera-menubar: render failed: {error:?}");
    }
}

/// One status item per user; a second instance exits quietly.
fn acquire_instance_lock() -> Option<File> {
    let dir = product_root()?.join("cli");
    std::fs::create_dir_all(&dir).ok()?;
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(dir.join("slopcamera-menubar.lock"))
        .ok()?;
    let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
    if result == 0 {
        Some(file)
    } else {
        None
    }
}

fn main() {
    let Some(root) = product_root() else {
        eprintln!("slopcamera-menubar: cannot resolve the user state directory (HOME unset)");
        std::process::exit(2);
    };
    // `--print-outputs` resolves the outputs directory for CLI/dev checks.
    if std::env::args().nth(1).as_deref() == Some("--print-outputs") {
        let outputs = root.join("outputs");
        let _ = std::fs::create_dir_all(&outputs);
        println!("{}", outputs.display());
        return;
    }
    let _instance = match acquire_instance_lock() {
        Some(lock) => lock,
        None => return,
    };
    let outputs = OutputsSection::new(root.join("outputs"));
    let _ = std::fs::create_dir_all(outputs.dir());
    let host = Arc::new(SlopcameraHost { outputs, browser: BrowserOpener::new() });
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
mod invitation_tests {
    use super::*;

    #[test]
    fn unavailable_outputs_offer_optional_support_without_a_newsletter_or_launch() {
        let host = SlopcameraHost {
            outputs: OutputsSection::new("/dev/null/absent-outputs"),
            browser: BrowserOpener::new(),
        };
        let model = host.snapshot();
        assert!(model.nodes.iter().any(|node| matches!(node,
            MenuNode::Item { id: Some(id), enabled: true, .. } if id == "product.support")));
        assert!(!model.nodes.iter().any(|node| matches!(node,
            MenuNode::Item { id: Some(id), .. } if id == "product.updates")));
        assert_eq!(host.browser.status(), BrowserStatus::Idle);
        assert!(matches!(host.dispatch_result("unknown.action"), DispatchOutcome::Rejected));
        assert_eq!(host.browser.status(), BrowserStatus::Idle);
    }
}
