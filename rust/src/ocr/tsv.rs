use anyhow::{Context, Result};
use serde::Serialize;
use std::fs;

#[derive(Debug, Serialize)]
pub struct OcrToken {
    pub text: String,
    pub confidence: f32,
    pub reliable: bool,
    pub bbox: BoundingBox,
    pub page: u32,
    pub block: u32,
    pub paragraph: u32,
    pub line: u32,
}

#[derive(Debug, Serialize)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub fn parse(path: &str) -> Result<Vec<OcrToken>> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path))?;

    let mut tokens = Vec::new();

    for line in content.lines().skip(1) {
        let fields: Vec<&str> = line.split('\t').collect();

        if fields.len() < 12 {
            continue;
        }

        let text = fields[11].trim();

        if text.is_empty() {
            continue;
        }

        let confidence: f32 = fields[10].parse().unwrap_or(-1.0);

        tokens.push(OcrToken {
            text: text.to_string(),
            confidence,
            reliable: confidence >= 60.0,
            bbox: BoundingBox {
                x: fields[6].parse().unwrap_or(0),
                y: fields[7].parse().unwrap_or(0),
                width: fields[8].parse().unwrap_or(0),
                height: fields[9].parse().unwrap_or(0),
            },
            page: fields[1].parse().unwrap_or(0),
            block: fields[2].parse().unwrap_or(0),
            paragraph: fields[3].parse().unwrap_or(0),
            line: fields[4].parse().unwrap_or(0),
        });
    }

    Ok(tokens)
}
