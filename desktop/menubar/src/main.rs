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
use desktop_foundation::{Host, MenuModel, MenuNode, Options};

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
}

impl Host for SlopcameraHost {
    fn snapshot(&self) -> MenuModel {
        let mut nodes = vec![MenuNode::disabled("Slopcamera Outputs"), MenuNode::Separator];
        nodes.extend(self.outputs.nodes());
        nodes.push(MenuNode::Separator);
        nodes.push(MenuNode::quit("Quit Slopcamera"));
        MenuModel {
            title: Some("Slopcamera".to_owned()),
            tooltip: Some("Slopcamera — agent outputs".to_owned()),
            icon: None,
            nodes,
        }
    }

    fn dispatch(&self, id: &str) {
        self.outputs.dispatch(id);
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
    if result == 0 { Some(file) } else { None }
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
    let host = Arc::new(SlopcameraHost { outputs });
    let options = Options { refresh: Duration::from_secs(3), companion_window: false };
    if let Err(error) = desktop_foundation::run(tauri::generate_context!(), host, options, |b| b) {
        eprintln!("slopcamera-menubar: {error}");
        std::process::exit(1);
    }
}
