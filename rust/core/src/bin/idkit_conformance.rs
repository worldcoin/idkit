//! JSON Lines driver for the native IDKit compatibility oracle.

use std::io::{self, BufRead, Write};

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    let mut runner = idkit::conformance::Runner::default();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let output = runner.process_line(&line);
        writeln!(stdout, "{output}")?;
        stdout.flush()?;
    }
    Ok(())
}
