//! The Slopcamera menu on menu kit v2: what Slopcamera is doing and your
//! credits at the top, the newest outputs, then login, support and Quit.
//! Pure: every input is passed in, so each state has a fixture.

use std::time::SystemTime;

use desktop_foundation::{
    outputs, Alternate, ItemState, MarkTone, MenuItem, MenuModel, MenuNode, Opens, Role,
    StatusMark, Symbol,
};

use crate::status::{ago, at_ms, explain, Status, STALE_RUNNING};

pub const NAME: &str = "Slopcamera";
pub const APP_ID: &str = "slopcamera";

pub const LOGIN: &str = "login";
pub const SUPPORT: &str = "support";
pub const DIAGNOSTICS: &str = "support.diagnostics";

/// Newest outputs shown. Three keeps the worst case within ten top-level rows.
pub const OUTPUTS_LIMIT: usize = 3;
const MAX_DETAIL: usize = 80;

/// The login item as the menu shows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Login {
    Off,
    On,
    /// Written by Slopcamera for another copy of the binary; clicking repoints it.
    Outdated,
    /// Written or edited by something else; left alone.
    NotOurs,
}

pub struct View<'a> {
    pub status: Option<&'a Status>,
    pub outputs: Vec<MenuNode>,
    pub login: Login,
    pub action_error: Option<&'a str>,
    pub now: SystemTime,
}

fn fit(text: String, fallback: impl FnOnce() -> String) -> String {
    if text.chars().count() <= MAX_DETAIL {
        text
    } else {
        fallback()
    }
}

fn activity_row(view: &View) -> (Symbol, String, Option<String>, MarkTone) {
    let Some(activity) = view.status.and_then(|status| status.activity.as_ref()) else {
        return (
            Symbol::StatusIdle,
            "Ready".into(),
            Some("Nothing rendered yet".into()),
            MarkTone::Normal,
        );
    };
    let started = at_ms(activity.started_at);
    let finished = activity.finished_at.map(at_ms).unwrap_or(started);
    match activity.state.as_str() {
        "running" if view.now.duration_since(started).unwrap_or_default() < STALE_RUNNING => (
            Symbol::StatusSyncing,
            activity.label.clone(),
            Some(format!("Started {}", ago(started, view.now))),
            MarkTone::Normal,
        ),
        "running" => (
            Symbol::StatusAttention,
            "Last job stopped early".into(),
            Some(fit(
                format!("{} · started {}", activity.label, ago(started, view.now)),
                || activity.label.clone(),
            )),
            MarkTone::Normal,
        ),
        "failed" => {
            let reason =
                explain(activity.error.as_deref().unwrap_or("internal")).trim_end_matches('.');
            (
                Symbol::StatusAttention,
                "Last job didn't finish".into(),
                Some(fit(format!("{} · {reason}", activity.label), || {
                    reason.to_owned()
                })),
                MarkTone::Attention,
            )
        }
        _ => (
            Symbol::StatusOk,
            "Ready".into(),
            Some(format!("Last job finished {}", ago(finished, view.now))),
            MarkTone::Normal,
        ),
    }
}

pub fn build(view: View) -> MenuModel {
    let (symbol, label, detail, mut tone) = activity_row(&view);
    let tooltip = format!("{NAME} · {label}");
    let mut nodes = vec![
        MenuNode::header(NAME),
        MenuNode::status(symbol, label, detail),
    ];
    if let Some(error) = view.action_error {
        nodes.push(MenuNode::status(
            Symbol::StatusAttention,
            error,
            Some("Try again".to_owned()),
        ));
    } else if let Some(credits) = view.status.and_then(|status| status.credits.as_ref()) {
        let checked = ago(at_ms(credits.checked_at), view.now);
        if credits.low {
            nodes.push(MenuNode::status(
                Symbol::StatusAttention,
                "Credits are low",
                Some(format!("{} left · checked {checked}", credits.usd)),
            ));
            tone = MarkTone::Attention;
        } else {
            nodes.push(MenuNode::status(
                Symbol::StatusOk,
                format!("{} in credits", credits.usd),
                Some(format!("Checked {checked}")),
            ));
        }
    }
    nodes.push(MenuNode::Separator);
    // The outputs folder is Slopcamera's interface, so its row is the primary action.
    nodes.extend(view.outputs.into_iter().map(|mut node| {
        if let MenuNode::Interactive { item } = &mut node {
            if item.id.as_deref() == Some(outputs::FOLDER_ID) {
                item.role = Some(Role::Primary);
                item.shortcut = Some("CmdOrCtrl+O".into());
                item.symbol = Some(Symbol::ActionFolder);
            }
        }
        node
    }));
    nodes.push(MenuNode::Separator);
    nodes.push(MenuNode::interactive(match view.login {
        Login::On => MenuItem::state(LOGIN, "Open at login", ItemState::On),
        Login::Off => MenuItem::state(LOGIN, "Open at login", ItemState::Off)
            .with_subtitle("macOS shows a notice when you turn this on"),
        Login::Outdated => MenuItem::state(LOGIN, "Open at login", ItemState::Mixed)
            .with_subtitle("Points to an older copy. Click to update it"),
        Login::NotOurs => MenuItem::state(LOGIN, "Open at login", ItemState::Mixed)
            .with_subtitle("Changed outside Slopcamera, so it's left alone")
            .disabled(),
    }));
    nodes.push(MenuNode::Separator);
    nodes.push(MenuNode::interactive(
        MenuItem::action(SUPPORT, "Updates & support")
            .with_symbol(Symbol::ActionSupport)
            .opens(Opens::Browser)
            .with_alternate(
                Alternate::new(DIAGNOSTICS, "Copy diagnostics").with_symbol(Symbol::ActionCopy),
            ),
    ));
    nodes.push(MenuNode::interactive(
        MenuItem::action(desktop_foundation::QUIT_ACTION_ID, format!("Quit {NAME}"))
            .with_shortcut("CmdOrCtrl+Q"),
    ));
    let mut model = MenuModel {
        tooltip: Some(tooltip),
        nodes,
        ..MenuModel::default()
    };
    model.set_mark(StatusMark::new(Symbol::MarkCamera, "Sc").with_tone(tone));
    model
}

/// "Copy diagnostics": version, state and fixed codes. No paths or tokens.
pub fn diagnostics(status: Option<&Status>, version: &str, now: SystemTime) -> String {
    let mut lines = vec![format!("Slopcamera menu bar {version}")];
    match status.and_then(|status| status.activity.as_ref()) {
        Some(activity) => lines.push(format!(
            "Last job: {} ({}{}), started {}",
            activity.label,
            activity.state,
            activity
                .error
                .as_deref()
                .map(|code| format!(", {code}"))
                .unwrap_or_default(),
            ago(at_ms(activity.started_at), now)
        )),
        None => lines.push("Last job: none".into()),
    }
    if let Some(credits) = status.and_then(|status| status.credits.as_ref()) {
        lines.push(format!(
            "Credits: {}{} (checked {})",
            credits.usd,
            if credits.low { ", low" } else { "" },
            ago(at_ms(credits.checked_at), now)
        ));
    }
    lines.join("\n") + "\n"
}
