//! What the CLI tells the menu bar: `cli/menubar-status.json` under the
//! Slopcamera folder. The CLI writes it around each media command and after
//! `slopcamera credits status`; it holds plain labels, times and fixed error
//! codes only. Reads are bounded and anything unreadable counts as absent.

use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;

pub const STATUS_FILE: &str = "menubar-status.json";
const MAX_BYTES: u64 = 16 * 1024;
const MAX_LABEL_CHARS: usize = 40;
/// A job that has said "running" for this long most likely stopped.
pub const STALE_RUNNING: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub schema_version: u32,
    pub activity: Option<Activity>,
    pub credits: Option<Credits>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub state: String,
    pub label: String,
    /// Milliseconds since the Unix epoch.
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credits {
    pub usd: String,
    pub low: bool,
    pub checked_at: u64,
}

pub fn at_ms(ms: u64) -> SystemTime {
    UNIX_EPOCH + Duration::from_millis(ms)
}

fn plain(text: &str, max: usize) -> bool {
    !text.is_empty()
        && text.chars().count() <= max
        && text
            .chars()
            .all(|c| c.is_alphanumeric() || " .,'$-".contains(c))
}

impl Status {
    pub fn read(cli_root: &Path) -> Option<Status> {
        let path = cli_root.join(STATUS_FILE);
        let meta = fs::symlink_metadata(&path).ok()?;
        if !meta.is_file() || meta.len() > MAX_BYTES {
            return None;
        }
        let mut bytes = Vec::new();
        fs::File::open(&path)
            .ok()?
            .take(MAX_BYTES)
            .read_to_end(&mut bytes)
            .ok()?;
        let mut status: Status = serde_json::from_slice(&bytes).ok()?;
        if status.schema_version != 1 {
            return None;
        }
        // Only show text the CLI's fixed vocabulary could have written.
        if status
            .activity
            .as_ref()
            .is_some_and(|activity| !plain(&activity.label, MAX_LABEL_CHARS))
        {
            status.activity = None;
        }
        if status
            .credits
            .as_ref()
            .is_some_and(|credits| !plain(&credits.usd, 16))
        {
            status.credits = None;
        }
        Some(status)
    }
}

/// "just now", "4 min ago", "3 hours ago", "yesterday", "2 days ago".
pub fn ago(then: SystemTime, now: SystemTime) -> String {
    let seconds = now.duration_since(then).unwrap_or_default().as_secs();
    match seconds {
        0..=59 => "just now".into(),
        60..=3_599 => format!("{} min ago", seconds / 60),
        3_600..=7_199 => "1 hour ago".into(),
        7_200..=86_399 => format!("{} hours ago", seconds / 3_600),
        86_400..=172_799 => "yesterday".into(),
        _ => format!("{} days ago", seconds / 86_400),
    }
}

/// A plain sentence for a fixed CLI error code.
pub fn explain(code: &str) -> &'static str {
    match code {
        "cancelled" => "It was stopped before it finished.",
        "not-found" => "A file it needed wasn't found.",
        "unavailable" => "A tool it needed isn't available on this Mac.",
        "authorization-required" => "It needs more credits first.",
        "subprocess" => "A render tool stopped with an error.",
        "invalid-data" | "incompatible" => "Its input wasn't in a form Slopcamera can use.",
        "unsafe-path" => "It was asked to use a folder Slopcamera won't write to.",
        "usage" => "The command had a typo or a missing option.",
        "conflict" => "Something else was changing the same project.",
        _ => "Something went wrong. Run the command again to see why.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(tag: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("slopcamera-status-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_the_cli_status_file() {
        let root = dir("read");
        std::fs::write(
            root.join(STATUS_FILE),
            r#"{"schemaVersion":1,"activity":{"state":"failed","label":"Rendering a recording","startedAt":1000,"finishedAt":2000,"error":"subprocess"},"credits":{"usd":"$4.20","low":false,"checkedAt":3000}}"#,
        )
        .unwrap();
        let status = Status::read(&root).unwrap();
        assert_eq!(
            status.activity.unwrap().error.as_deref(),
            Some("subprocess")
        );
        assert_eq!(status.credits.unwrap().usd, "$4.20");
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn drops_text_outside_the_fixed_vocabulary() {
        let root = dir("odd");
        std::fs::write(
            root.join(STATUS_FILE),
            r#"{"schemaVersion":1,"activity":{"state":"running","label":"/Users/me/secret.mov","startedAt":1},"credits":{"usd":"<b>","low":false,"checkedAt":1}}"#,
        )
        .unwrap();
        let status = Status::read(&root).unwrap();
        assert_eq!(status.activity, None);
        assert_eq!(status.credits, None);
        std::fs::write(root.join(STATUS_FILE), r#"{"schemaVersion":2}"#).unwrap();
        assert_eq!(Status::read(&root), None);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn every_code_has_a_plain_sentence() {
        for code in [
            "cancelled",
            "not-found",
            "unavailable",
            "subprocess",
            "internal",
            "new-code",
        ] {
            let text = explain(code);
            assert!(text.ends_with('.') && !text.contains('-'), "{text}");
        }
    }
}
