use chrono::{DateTime, Datelike, Duration, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct LogLine {
    #[serde(rename = "type")]
    ty: Option<String>,
    timestamp: Option<String>,
    message: Option<MessageField>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum MessageField {
    Obj(MessageObj),
    #[allow(dead_code)]
    Other(serde_json::Value),
}

#[derive(Debug, Deserialize)]
struct MessageObj {
    id: Option<String>,
    model: Option<String>,
    usage: Option<UsageObj>,
    content: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct UsageObj {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    cache_creation_input_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
    #[serde(default)]
    speed: Option<String>,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ModelUsage {
    #[serde(rename = "in")]
    pub input: f64,
    pub out: f64,
    #[serde(rename = "cacheWrite")]
    pub cache_write: f64,
    #[serde(rename = "cacheRead")]
    pub cache_read: f64,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ToolUsage {
    pub name: String,
    pub calls: u64,
    pub tokens: u64,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct Usage {
    #[serde(rename = "byModel")]
    pub by_model: HashMap<String, ModelUsage>,
    #[serde(rename = "byTool")]
    pub by_tool: Vec<ToolUsage>,
    #[serde(rename = "sparkline")]
    pub sparkline: Vec<f64>,
    #[serde(rename = "sparkLeft")]
    pub spark_left: String,
    #[serde(rename = "sparkRight")]
    pub spark_right: String,
    #[serde(rename = "rangeLabel")]
    pub range_label: String,
    #[serde(rename = "totalCost")]
    pub total_cost: f64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: f64,
    #[serde(rename = "deltaPct")]
    pub delta_pct: Option<f64>,
}

fn normalize_model(raw: &str) -> Option<String> {
    let r = raw.to_lowercase();
    if r.contains("synthetic") {
        return None;
    }
    if !(r.contains("opus") || r.contains("haiku") || r.contains("sonnet")) {
        return None;
    }
    // Strip trailing -YYYYMMDD date suffix
    let canonical = match r.rsplit_once('-') {
        Some((head, tail))
            if tail.len() == 8 && tail.chars().all(|c| c.is_ascii_digit()) =>
        {
            head.to_string()
        }
        _ => r.clone(),
    };
    Some(canonical)
}

struct Pricing {
    input: f64,
    output: f64,
    cache_write: f64,
    cache_read: f64,
}

fn pricing(model: &str) -> Pricing {
    let m = model.to_lowercase();
    let is_fast = m.contains("-fast");
    let base = if m.contains("opus") {
        // Opus 4.6/4.7 pricing as of 2026 (per ccusage)
        Pricing {
            input: 5.0,
            output: 25.0,
            cache_write: 6.25,
            cache_read: 0.5,
        }
    } else if m.contains("haiku") {
        Pricing {
            input: 1.0,
            output: 5.0,
            cache_write: 1.25,
            cache_read: 0.1,
        }
    } else {
        // sonnet (any version) and fallback
        Pricing {
            input: 3.0,
            output: 15.0,
            cache_write: 3.75,
            cache_read: 0.3,
        }
    };
    if is_fast {
        // Claude Code priority/fast tier — 6x standard
        Pricing {
            input: base.input * 6.0,
            output: base.output * 6.0,
            cache_write: base.cache_write * 6.0,
            cache_read: base.cache_read * 6.0,
        }
    } else {
        base
    }
}

fn calc_cost_k(u: &ModelUsage, model: &str) -> f64 {
    let p = pricing(model);
    (u.input * p.input
        + u.out * p.output
        + u.cache_write * p.cache_write
        + u.cache_read * p.cache_read)
        / 1000.0
}

fn projects_root() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

fn list_jsonl_files() -> Vec<PathBuf> {
    let Some(root) = projects_root() else { return Vec::new(); };
    let pattern = format!("{}/**/*.jsonl", root.display());
    glob::glob(&pattern)
        .map(|it| it.filter_map(Result::ok).collect())
        .unwrap_or_default()
}

pub enum Range {
    Live,
    Session,
    Today,
    Week,
    Month,
    All,
}

impl Range {
    fn parse(s: &str) -> Self {
        match s {
            "live" => Range::Live,
            "session" => Range::Session,
            "today" => Range::Today,
            "week" => Range::Week,
            "month" => Range::Month,
            _ => Range::All,
        }
    }

    fn label(&self) -> &'static str {
        match self {
            Range::Live => "Live",
            Range::Session => "Current session",
            Range::Today => "Today",
            Range::Week => "This week",
            Range::Month => "This month",
            Range::All => "All-time",
        }
    }

    fn start(&self) -> Option<DateTime<Utc>> {
        let now = Local::now();
        match self {
            Range::Live => Some(Utc::now() - Duration::minutes(30)),
            // Session is handled via session_id filter, not a time window
            Range::Session => None,
            Range::Today => {
                let d = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
                Local.from_local_datetime(&d).single().map(|x| x.with_timezone(&Utc))
            }
            Range::Week => {
                let weekday = now.weekday().num_days_from_monday() as i64;
                let d = (now - Duration::days(weekday))
                    .date_naive()
                    .and_hms_opt(0, 0, 0)
                    .unwrap();
                Local.from_local_datetime(&d).single().map(|x| x.with_timezone(&Utc))
            }
            Range::Month => {
                let d = now
                    .date_naive()
                    .with_day(1)
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap();
                Local.from_local_datetime(&d).single().map(|x| x.with_timezone(&Utc))
            }
            Range::All => None,
        }
    }
}

fn extract_tool_uses(content: &serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(arr) = content.as_array() {
        for item in arr {
            if item.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                    out.push(name.to_string());
                }
            }
        }
    }
    out
}

fn find_latest_session() -> Option<(String, DateTime<Utc>, DateTime<Utc>)> {
    let mut latest: Option<(DateTime<Utc>, String)> = None;
    let mut spans: HashMap<String, (DateTime<Utc>, DateTime<Utc>)> = HashMap::new();
    for path in list_jsonl_files() {
        let Ok(file) = File::open(&path) else { continue };
        let reader = BufReader::new(file);
        for line in reader.lines() {
            let Ok(line) = line else { continue };
            if line.trim().is_empty() {
                continue;
            }
            let Ok(ev) = serde_json::from_str::<LogLine>(&line) else { continue };
            if ev.ty.as_deref() != Some("assistant") {
                continue;
            }
            let Some(sid) = ev.session_id.as_deref() else { continue };
            let Some(ts) = ev
                .timestamp
                .as_deref()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.with_timezone(&Utc))
            else {
                continue;
            };
            let entry = spans.entry(sid.to_string()).or_insert((ts, ts));
            if ts < entry.0 {
                entry.0 = ts;
            }
            if ts > entry.1 {
                entry.1 = ts;
            }
            match &latest {
                Some((t, _)) if *t >= ts => {}
                _ => latest = Some((ts, sid.to_string())),
            }
        }
    }
    latest.and_then(|(_, sid)| {
        spans.get(&sid).map(|(s, e)| (sid.clone(), *s, *e))
    })
}

struct SparkCfg {
    start: DateTime<Utc>,
    bucket_seconds: i64,
    count: usize,
    left: String,
    right: String,
}

fn spark_config(range: &Range, session_span: Option<(DateTime<Utc>, DateTime<Utc>)>) -> SparkCfg {
    let now = Utc::now();
    let local_now = Local::now();
    match range {
        Range::Live => SparkCfg {
            start: now - Duration::minutes(30),
            bucket_seconds: 60,
            count: 30,
            left: "30m ago".into(),
            right: "now".into(),
        },
        Range::Today => {
            let midnight = local_now
                .date_naive()
                .and_hms_opt(0, 0, 0)
                .and_then(|d| Local.from_local_datetime(&d).single())
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or(now);
            SparkCfg {
                start: midnight,
                bucket_seconds: 3600,
                count: 24,
                left: "12am".into(),
                right: "now".into(),
            }
        }
        Range::Week => {
            let weekday = local_now.weekday().num_days_from_monday() as i64;
            let start = (local_now - Duration::days(weekday))
                .date_naive()
                .and_hms_opt(0, 0, 0)
                .and_then(|d| Local.from_local_datetime(&d).single())
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or(now - Duration::days(7));
            SparkCfg {
                start,
                bucket_seconds: 86400,
                count: 7,
                left: "Mon".into(),
                right: "Today".into(),
            }
        }
        Range::Month => {
            let start = local_now
                .date_naive()
                .with_day(1)
                .and_then(|d| d.and_hms_opt(0, 0, 0))
                .and_then(|d| Local.from_local_datetime(&d).single())
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or(now - Duration::days(30));
            let days = local_now.day() as usize;
            SparkCfg {
                start,
                bucket_seconds: 86400,
                count: days.max(1),
                left: "1st".into(),
                right: "Today".into(),
            }
        }
        Range::All => SparkCfg {
            start: (local_now - Duration::days(29))
                .date_naive()
                .and_hms_opt(0, 0, 0)
                .and_then(|d| Local.from_local_datetime(&d).single())
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or(now - Duration::days(30)),
            bucket_seconds: 86400,
            count: 30,
            left: "30d ago".into(),
            right: "Today".into(),
        },
        Range::Session => {
            if let Some((start, end)) = session_span {
                let span = (end - start).num_seconds().max(60);
                let bucket = (span / 20).max(30);
                SparkCfg {
                    start,
                    bucket_seconds: bucket,
                    count: 20,
                    left: "start".into(),
                    right: "now".into(),
                }
            } else {
                SparkCfg {
                    start: now - Duration::hours(1),
                    bucket_seconds: 180,
                    count: 20,
                    left: "start".into(),
                    right: "now".into(),
                }
            }
        }
    }
}

pub fn compute_usage(range_str: &str) -> Usage {
    let range = Range::parse(range_str);
    let range_start = range.start();
    let latest_session = if matches!(range, Range::Session) {
        find_latest_session()
    } else {
        None
    };
    let session_filter: Option<String> = latest_session.as_ref().map(|(sid, _, _)| sid.clone());
    let session_span = latest_session.as_ref().map(|(_, s, e)| (*s, *e));

    let mut by_model: HashMap<String, ModelUsage> = HashMap::new();
    let mut tool_counts: HashMap<String, (u64, u64)> = HashMap::new();
    let mut seen_msg_ids: HashSet<String> = HashSet::new();

    let today_local = Local::now().date_naive();
    let mut daily: Vec<f64> = vec![0.0; 30];

    let spark_cfg = spark_config(&range, session_span);
    let mut spark: Vec<f64> = vec![0.0; spark_cfg.count];

    let files = list_jsonl_files();
    for path in files {
        let Ok(file) = File::open(&path) else { continue; };
        let reader = BufReader::new(file);
        for line in reader.lines() {
            let Ok(line) = line else { continue; };
            if line.trim().is_empty() {
                continue;
            }
            let Ok(ev) = serde_json::from_str::<LogLine>(&line) else { continue; };
            if ev.ty.as_deref() != Some("assistant") {
                continue;
            }
            let Some(MessageField::Obj(msg)) = ev.message else { continue; };
            let Some(usage) = msg.usage else { continue; };
            if let Some(id) = msg.id.as_ref() {
                if !seen_msg_ids.insert(id.clone()) {
                    continue;
                }
            }
            let model_raw = msg.model.as_deref().unwrap_or("");
            let Some(mut model) = normalize_model(model_raw) else { continue; };
            if usage.speed.as_deref() == Some("fast") && !model.contains("-fast") {
                model.push_str("-fast");
            }

            let ts_utc = ev
                .timestamp
                .as_deref()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.with_timezone(&Utc));

            let in_range = if let Some(ref sid) = session_filter {
                ev.session_id.as_deref() == Some(sid.as_str())
            } else {
                match (ts_utc, range_start) {
                    (_, None) => true,
                    (Some(t), Some(s)) => t >= s,
                    (None, Some(_)) => false,
                }
            };

            let in_k = usage.input_tokens as f64 / 1000.0;
            let out_k = usage.output_tokens as f64 / 1000.0;
            let cw_k = usage.cache_creation_input_tokens as f64 / 1000.0;
            let cr_k = usage.cache_read_input_tokens as f64 / 1000.0;

            if in_range {
                let entry = by_model.entry(model.clone()).or_default();
                entry.input += in_k;
                entry.out += out_k;
                entry.cache_write += cw_k;
                entry.cache_read += cr_k;

                if let Some(content) = msg.content {
                    for tool_name in extract_tool_uses(&content) {
                        let e = tool_counts.entry(tool_name).or_insert((0, 0));
                        e.0 += 1;
                        e.1 += usage.output_tokens;
                    }
                }
            }

            if let Some(t) = ts_utc {
                let local_d = t.with_timezone(&Local).date_naive();
                let diff = today_local.signed_duration_since(local_d).num_days();
                let tmp = ModelUsage {
                    input: in_k,
                    out: out_k,
                    cache_write: cw_k,
                    cache_read: cr_k,
                };
                let cost = calc_cost_k(&tmp, &model);
                if (0..30).contains(&diff) {
                    let idx = (29 - diff) as usize;
                    daily[idx] += cost;
                }
                if in_range {
                    let delta_secs = (t - spark_cfg.start).num_seconds();
                    if delta_secs >= 0 {
                        let bucket = (delta_secs / spark_cfg.bucket_seconds) as usize;
                        if bucket < spark_cfg.count {
                            spark[bucket] += cost;
                        }
                    }
                }
            }
        }
    }

    let total_cost: f64 = by_model
        .iter()
        .map(|(m, u)| calc_cost_k(u, m))
        .sum();
    let total_tokens: f64 = by_model
        .values()
        .map(|u| u.input + u.out + u.cache_write + u.cache_read)
        .sum();

    let mut tools: Vec<ToolUsage> = tool_counts
        .into_iter()
        .map(|(name, (calls, tokens))| ToolUsage { name, calls, tokens })
        .collect();
    tools.sort_by(|a, b| b.calls.cmp(&a.calls));
    tools.truncate(6);

    let delta_pct = if daily.len() >= 2 {
        let today_v = *daily.last().unwrap();
        let yest_v = daily[daily.len() - 2];
        if yest_v > 0.0 {
            Some(((today_v - yest_v) / yest_v) * 100.0)
        } else {
            None
        }
    } else {
        None
    };

    Usage {
        by_model,
        by_tool: tools,
        sparkline: spark,
        spark_left: spark_cfg.left,
        spark_right: spark_cfg.right,
        range_label: range.label().to_string(),
        total_cost,
        total_tokens,
        delta_pct,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_compute_all() {
        for r in ["live", "session", "today", "week", "month", "all"] {
            let u = compute_usage(r);
            eprintln!(
                "{:10} cost=${:.2} tokens={:.1}K tools={} spark[{}..{}]=({})-({}) sum={:.2}",
                r,
                u.total_cost,
                u.total_tokens,
                u.by_tool.len(),
                u.sparkline.len(),
                u.sparkline.len(),
                u.spark_left,
                u.spark_right,
                u.sparkline.iter().sum::<f64>(),
            );
        }
    }
}
