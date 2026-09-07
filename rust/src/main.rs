mod ocr;

use anyhow::{Context, Result};
use std::fs;
use std::process::Command;

fn main() -> Result<()> {
    let input = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "data/input/online-chitta.png".to_string());

    let tsv = "data/output/chitta.tsv";
    let json = "data/output/chitta.json";

    println!("Input: {}", input);
    println!("Running Tesseract...");

    fs::create_dir_all("data/output")?;

    let status = Command::new("tesseract")
        .arg(&input)
        .arg("data/output/chitta")
        .arg("-l")
        .arg("tam+eng")
        .arg("tsv")
        .status()
        .context("failed to start tesseract")?;

    if !status.success() {
        anyhow::bail!("Tesseract OCR failed");
    }

    println!("Tesseract completed.");

    let tokens = ocr::tsv::parse(tsv)?;

    let output = serde_json::to_string_pretty(&tokens)?;

    fs::write(json, output)?;

    println!("OCR tokens: {}", tokens.len());
    println!("JSON written to: {}", json);

    Ok(())
}