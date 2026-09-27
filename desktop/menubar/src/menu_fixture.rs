//! Test support: turns a [`MenuModel`] into the protocol v2 snapshot JSON
//! that `companion lint-menu --strict` checks, and into the indented text
//! tree (`renderMenuTree`) that fixtures and pull requests show.
//!
//! desktop-foundation 0.8.0 parses v2 snapshots but has no Rust serializer,
//! so this mirrors `docs/protocol-v2.md` for the fields this product uses.
//! Fixtures are written under `fixtures/` and compared byte for byte;
//! `UPDATE_MENU_FIXTURES=1 cargo test` rewrites them.

use std::path::{Path, PathBuf};

use desktop_foundation::{
    ItemState, MarkTone, MenuItem, MenuItemKind, MenuModel, MenuNode, Opens, Role,
};
use serde_json::{json, Map, Value};

const QUIT: &str = desktop_foundation::QUIT_ACTION_ID;

fn opens(value: Opens) -> &'static str {
    match value {
        Opens::Browser => "browser",
        Opens::Finder => "finder",
        Opens::Settings => "settings",
        Opens::Dialog => "dialog",
    }
}

fn tone(value: MarkTone) -> Option<&'static str> {
    match value {
        MarkTone::Normal => None,
        MarkTone::Attention => Some("attention"),
        MarkTone::Error => Some("error"),
        MarkTone::Paused => Some("paused"),
        MarkTone::Offline => Some("offline"),
    }
}

fn state(kind: &MenuItemKind) -> Option<&'static str> {
    match kind {
        MenuItemKind::State {
            state: ItemState::On,
        }
        | MenuItemKind::Toggle { checked: true }
        | MenuItemKind::Check { checked: true }
        | MenuItemKind::Radio { selected: true, .. } => Some("on"),
        MenuItemKind::State {
            state: ItemState::Mixed,
        } => Some("mixed"),
        MenuItemKind::Action => None,
        _ => Some("off"),
    }
}

fn action(item: &MenuItem) -> Value {
    let Some(id) = item.id.as_deref() else {
        let mut label = Map::new();
        label.insert("kind".into(), json!("label"));
        label.insert("label".into(), json!(item.title));
        if let Some(subtitle) = &item.subtitle {
            label.insert("subtitle".into(), json!(subtitle));
        }
        return Value::Object(label);
    };
    if id == QUIT {
        return json!({ "kind": "quit", "label": item.title });
    }
    let mut out = Map::new();
    out.insert("kind".into(), json!("action"));
    out.insert("id".into(), json!(id));
    out.insert("label".into(), json!(item.title));
    if !item.enabled {
        out.insert("enabled".into(), json!(false));
    }
    if let Some(value) = state(&item.kind) {
        out.insert("state".into(), json!(value));
    }
    if let Some(symbol) = item.symbol {
        out.insert("symbol".into(), json!(symbol.name()));
    }
    if let Some(subtitle) = &item.subtitle {
        out.insert("subtitle".into(), json!(subtitle));
    }
    if let Some(badge) = &item.badge {
        out.insert("badge".into(), json!(badge));
    }
    if let Some(tooltip) = &item.tooltip {
        out.insert("tooltip".into(), json!(tooltip));
    }
    if let Some(shortcut) = &item.shortcut {
        out.insert("shortcut".into(), json!(shortcut));
    }
    if let Some(alternate) = &item.alternate {
        let mut alt = Map::new();
        alt.insert("id".into(), json!(alternate.id));
        alt.insert("label".into(), json!(alternate.title));
        if let Some(symbol) = alternate.symbol {
            alt.insert("symbol".into(), json!(symbol.name()));
        }
        out.insert("alternate".into(), Value::Object(alt));
    }
    if let Some(role) = item.role {
        out.insert(
            "role".into(),
            json!(match role {
                Role::Primary => "primary",
                Role::Destructive => "destructive",
            }),
        );
    }
    if let Some(value) = item.opens {
        out.insert("opens".into(), json!(opens(value)));
    }
    Value::Object(out)
}

fn wire_node(node: &MenuNode) -> Value {
    match node {
        MenuNode::Header { title } => json!({ "kind": "header", "label": title }),
        MenuNode::Status {
            symbol,
            title,
            detail,
        } => {
            let mut out = Map::new();
            out.insert("kind".into(), json!("status"));
            out.insert("symbol".into(), json!(symbol.name()));
            out.insert("label".into(), json!(title));
            if let Some(detail) = detail {
                out.insert("detail".into(), json!(detail));
            }
            Value::Object(out)
        }
        MenuNode::Separator => json!({ "kind": "separator" }),
        MenuNode::Item {
            id: None, title, ..
        } => json!({ "kind": "label", "label": title }),
        MenuNode::Item {
            id: Some(id),
            title,
            ..
        } if id == QUIT => {
            json!({ "kind": "quit", "label": title })
        }
        MenuNode::Item {
            id: Some(id),
            title,
            enabled,
            ..
        } => {
            let mut out = Map::new();
            out.insert("kind".into(), json!("action"));
            out.insert("id".into(), json!(id));
            out.insert("label".into(), json!(title));
            if !enabled {
                out.insert("enabled".into(), json!(false));
            }
            Value::Object(out)
        }
        MenuNode::Interactive { item } => action(item),
        MenuNode::Submenu {
            title,
            items,
            symbol,
        } => {
            let mut out = Map::new();
            out.insert("kind".into(), json!("submenu"));
            out.insert("label".into(), json!(title));
            if let Some(symbol) = symbol {
                out.insert("symbol".into(), json!(symbol.name()));
            }
            out.insert(
                "items".into(),
                Value::Array(items.iter().map(wire_node).collect()),
            );
            Value::Object(out)
        }
    }
}

/// The protocol v2 snapshot for `model`.
pub fn snapshot(model: &MenuModel, app_id: &str, name: &str) -> Value {
    let mark = model
        .status_mark
        .as_ref()
        .expect("v2 menus set a status mark");
    let mut wire_mark = Map::new();
    wire_mark.insert("symbol".into(), json!(mark.symbol.name()));
    wire_mark.insert("letters".into(), json!(mark.letters));
    if let Some(value) = tone(mark.tone) {
        wire_mark.insert("tone".into(), json!(value));
    }
    if let Some(text) = &mark.text {
        wire_mark.insert("text".into(), json!(text));
    }
    let mut out = Map::new();
    out.insert("version".into(), json!(2));
    out.insert("type".into(), json!("snapshot"));
    out.insert("appId".into(), json!(app_id));
    out.insert("name".into(), json!(name));
    out.insert("revision".into(), json!(1));
    out.insert("mark".into(), Value::Object(wire_mark));
    if let Some(tooltip) = &model.tooltip {
        out.insert("tooltip".into(), json!(tooltip));
    }
    out.insert(
        "items".into(),
        Value::Array(model.nodes.iter().map(wire_node).collect()),
    );
    Value::Object(out)
}

fn fallback(symbol: Option<&str>) -> Option<&'static str> {
    symbol
        .and_then(desktop_foundation::Symbol::from_name)
        .and_then(desktop_foundation::Symbol::fallback)
}

fn shortcut_text(value: &str) -> String {
    value
        .replace("CmdOrCtrl+", "⌘")
        .replace("Cmd+", "⌘")
        .replace("Shift+", "⇧")
        .replace("Alt+", "⌥")
}

/// The text tree `renderMenuTree` prints for a v2 snapshot.
pub fn tree(snapshot: &Value) -> String {
    let mut lines = Vec::new();
    let mark = &snapshot["mark"];
    let tone = mark["tone"]
        .as_str()
        .map(|t| format!(", {t}"))
        .unwrap_or_default();
    let text = mark["text"]
        .as_str()
        .map(|t| format!(", {t}"))
        .unwrap_or_default();
    let tooltip = snapshot["tooltip"]
        .as_str()
        .map(|t| format!(" {t}"))
        .unwrap_or_default();
    lines.push(format!(
        "[{} {}{tone}{text}]{tooltip}",
        mark["symbol"].as_str().unwrap_or(""),
        mark["letters"].as_str().unwrap_or("")
    ));
    fn visit(items: &[Value], depth: usize, lines: &mut Vec<String>) {
        let pad = "  ".repeat(depth);
        for item in items {
            let label = item["label"].as_str().unwrap_or("");
            match item["kind"].as_str().unwrap_or("") {
                "separator" => lines.push(format!("{pad}─────────")),
                "header" | "quit" => lines.push(format!("{pad}{label}")),
                "status" => {
                    let glyph = fallback(item["symbol"].as_str()).unwrap_or("");
                    let detail = item["detail"]
                        .as_str()
                        .map(|d| format!(" · {d}"))
                        .unwrap_or_default();
                    lines.push(format!("{pad}{glyph} {label}{detail}"));
                }
                "label" => {
                    let subtitle = item["subtitle"]
                        .as_str()
                        .map(|d| format!(" · {d}"))
                        .unwrap_or_default();
                    lines.push(format!("{pad}{label}{subtitle} (label)"));
                }
                "submenu" => {
                    let glyph = fallback(item["symbol"].as_str())
                        .map(|g| format!("{g} "))
                        .unwrap_or_default();
                    lines.push(format!("{pad}{glyph}{label} ▸"));
                    visit(
                        item["items"].as_array().map(Vec::as_slice).unwrap_or(&[]),
                        depth + 1,
                        lines,
                    );
                }
                "action" => {
                    let mark = match item["state"].as_str() {
                        Some("on") => "✓ ",
                        Some("mixed") => "– ",
                        _ => "",
                    };
                    let glyph = fallback(item["symbol"].as_str())
                        .map(|g| format!("{g} "))
                        .unwrap_or_default();
                    let subtitle = item["subtitle"]
                        .as_str()
                        .map(|d| format!(" · {d}"))
                        .unwrap_or_default();
                    let badge = item["badge"]
                        .as_str()
                        .map(|d| format!("  {d}"))
                        .unwrap_or_default();
                    let opens = match item["opens"].as_str() {
                        Some("browser") => " ↗",
                        Some("settings") | Some("dialog") => "…",
                        _ => "",
                    };
                    let mut line = format!("{pad}{mark}{glyph}{label}{subtitle}{badge}{opens}");
                    if let Some(role) = item["role"].as_str() {
                        line.push_str(&format!(" ({role})"));
                    }
                    if item["enabled"] == json!(false) {
                        line.push_str(" (disabled)");
                    }
                    if let Some(shortcut) = item["shortcut"].as_str() {
                        line.push_str(&format!("  {}", shortcut_text(shortcut)));
                    }
                    lines.push(line);
                    if let Some(alternate) = item["alternate"]["label"].as_str() {
                        lines.push(format!("{pad}  ⌥ {alternate}"));
                    }
                }
                _ => {}
            }
        }
    }
    visit(
        snapshot["items"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or(&[]),
        0,
        &mut lines,
    );
    lines.join("\n") + "\n"
}

/// Replaces per-file output IDs (a hash of the file's identity) with stable
/// numbers so fixtures do not change between runs.
pub fn stable_output_ids(mut value: Value) -> Value {
    let mut seen: Vec<String> = Vec::new();
    fn walk(value: &mut Value, seen: &mut Vec<String>) {
        match value {
            Value::Object(map) => {
                for (key, entry) in map.iter_mut() {
                    if key == "id" {
                        if let Some(id) = entry.as_str() {
                            for prefix in [
                                desktop_foundation::outputs::OPEN_PREFIX,
                                desktop_foundation::outputs::REVEAL_PREFIX,
                            ] {
                                if let Some(hash) = id.strip_prefix(prefix) {
                                    let index = match seen.iter().position(|h| h == hash) {
                                        Some(index) => index,
                                        None => {
                                            seen.push(hash.to_owned());
                                            seen.len() - 1
                                        }
                                    };
                                    *entry = json!(format!("{prefix}file{}", index + 1));
                                    break;
                                }
                            }
                        }
                    } else {
                        walk(entry, seen);
                    }
                }
            }
            Value::Array(items) => items.iter_mut().for_each(|item| walk(item, seen)),
            _ => {}
        }
    }
    walk(&mut value, &mut seen);
    value
}

fn fixtures_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures")
}

/// Writes or compares `fixtures/menu-<state>.json` and `.txt`.
pub fn check(state: &str, model: &MenuModel, app_id: &str, name: &str) {
    model.validate().expect("the menu model is valid");
    let value = stable_output_ids(snapshot(model, app_id, name));
    let json_text = serde_json::to_string_pretty(&value).unwrap() + "\n";
    let tree_text = tree(&value);
    let dir = fixtures_dir();
    let json_path = dir.join(format!("menu-{state}.json"));
    let tree_path = dir.join(format!("menu-{state}.txt"));
    if std::env::var_os("UPDATE_MENU_FIXTURES").is_some() {
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&json_path, &json_text).unwrap();
        std::fs::write(&tree_path, &tree_text).unwrap();
        return;
    }
    let expected_json = std::fs::read_to_string(&json_path).unwrap_or_else(|_| {
        panic!(
            "missing {}; run UPDATE_MENU_FIXTURES=1 cargo test",
            json_path.display()
        )
    });
    let expected_tree = std::fs::read_to_string(&tree_path).unwrap_or_else(|_| {
        panic!(
            "missing {}; run UPDATE_MENU_FIXTURES=1 cargo test",
            tree_path.display()
        )
    });
    assert_eq!(tree_text, expected_tree, "menu tree for {state} changed");
    assert_eq!(
        json_text, expected_json,
        "menu snapshot for {state} changed"
    );
}
