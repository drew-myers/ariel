#!/usr/bin/env bun
// ariel — CLI for beautiful-mermaid
// Renders Mermaid diagrams as ASCII/Unicode art or SVG

import {
  renderMermaidASCII,
  renderMermaidSVG,
  THEMES,
} from "beautiful-mermaid";
import type { AsciiRenderOptions, AsciiTheme } from "beautiful-mermaid";
import type { DiagramColors } from "beautiful-mermaid";

// ============================================================================
// Terminal background detection
// ============================================================================

const DARK_ASCII_THEME: AsciiTheme = {
  fg: "#d4d4d8", // zinc-300 — bright text for dark backgrounds
  border: "#a1a1aa", // zinc-400
  line: "#71717a", // zinc-500
  arrow: "#a1a1aa", // zinc-400
  corner: "#71717a",
  junction: "#a1a1aa",
};

const LIGHT_ASCII_THEME: AsciiTheme = {
  fg: "#27272a", // zinc-800 — dark text for light backgrounds
  border: "#a1a1aa", // zinc-400
  line: "#71717a", // zinc-500
  arrow: "#52525b", // zinc-600
  corner: "#71717a",
  junction: "#a1a1aa",
};

/**
 * Detect whether the terminal has a dark or light background.
 *
 * Strategy:
 * 1. OSC 11 query — asks the terminal for its actual background color
 * 2. COLORFGBG env var — set by some terminals (e.g. rxvt, xterm)
 * 3. Default to dark (most common terminal setup)
 */
async function detectDarkBackground(): Promise<boolean> {
  // Only attempt detection on a TTY
  if (!process.stderr.isTTY) return true;

  // Try OSC 11 query first (most reliable)
  try {
    const result = await queryTerminalBackground(200);
    if (result !== null) return result;
  } catch {
    // Fall through
  }

  // Try COLORFGBG env var (format: "fg;bg" where bg >= 8 is usually dark)
  const colorfgbg = process.env.COLORFGBG;
  if (colorfgbg) {
    const parts = colorfgbg.split(";");
    const bg = parseInt(parts[parts.length - 1]!, 10);
    if (!isNaN(bg)) {
      // In 16-color palette: 0-6 are dark, 7-15 are light
      return bg < 7;
    }
  }

  // Default to dark
  return true;
}

/**
 * Query the terminal's background color using OSC 11.
 * Returns true for dark, false for light, null if detection failed.
 */
function queryTerminalBackground(timeoutMs: number): Promise<boolean | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    function cleanup() {
      clearTimeout(timer);
      stdin.removeListener("data", onData);
      if (stdin.isRaw !== wasRaw) {
        stdin.setRawMode(wasRaw);
      }
      // Unpause stdin if we paused it — prevents hanging
      stdin.pause();
    }

    function onData(data: Buffer) {
      const str = data.toString();
      // Response format: ESC ] 11 ; rgb:RRRR/GGGG/BBBB ESC \ (or BEL)
      const match = str.match(
        /\]11;rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/
      );
      if (match) {
        // Parse the first 2 hex digits of each component (they're 16-bit values)
        const r = parseInt(match[1]!.slice(0, 2), 16);
        const g = parseInt(match[2]!.slice(0, 2), 16);
        const b = parseInt(match[3]!.slice(0, 2), 16);
        const luminance = (r * 299 + g * 587 + b * 114) / 1000;
        cleanup();
        resolve(luminance < 140);
      }
    }

    stdin.on("data", onData);
    stdin.setRawMode(true);
    stdin.resume();

    // Send OSC 11 query: "what is your background color?"
    process.stderr.write("\x1b]11;?\x07");
  });
}

// ============================================================================
// Argument parsing
// ============================================================================

const args = process.argv.slice(2);

function hasFlag(...names: string[]): boolean {
  return names.some((n) => args.includes(n));
}

function getFlagValue(...names: string[]): string | undefined {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  }
  return undefined;
}

function getPositionalFile(): string | undefined {
  // First arg that doesn't start with - and isn't a flag value
  const flagsWithValues = new Set([
    "-o",
    "--output",
    "--color",
    "--theme",
    "--padding-x",
    "--padding-y",
  ]);
  const skipNext = new Set<number>();
  for (let i = 0; i < args.length; i++) {
    if (flagsWithValues.has(args[i]!)) {
      skipNext.add(i + 1);
    }
  }
  for (let i = 0; i < args.length; i++) {
    if (skipNext.has(i)) continue;
    if (!args[i]!.startsWith("-")) return args[i];
  }
  return undefined;
}

// ============================================================================
// Help & version
// ============================================================================

const VERSION = "0.1.0";

const HELP = `ariel — render Mermaid diagrams in your terminal

Usage:
  ariel [file]              Render to Unicode box-drawing (default)
  ariel [file] --svg        Render to SVG
  echo '...' | ariel        Read from stdin

Options:
  --svg                     Output SVG instead of terminal art
  --ascii                   Use ASCII characters (+,-,|) instead of Unicode
  --color <mode>            Color mode: auto, none, ansi16, ansi256, truecolor
                            (default: auto)
  --dark                    Force dark-background theme (auto-detected by default)
  --light                   Force light-background theme
  --theme <name>            Theme for SVG output (use --list-themes to see all)
  -o, --output <file>       Write output to file instead of stdout
  --padding-x <n>           Horizontal spacing between nodes (default: 5)
  --padding-y <n>           Vertical spacing between nodes (default: 5)
  --list-themes             List available themes
  -h, --help                Show this help
  -v, --version             Show version

Examples:
  echo 'graph LR; A --> B --> C' | ariel
  ariel diagram.mmd
  ariel diagram.mmd --svg --theme tokyo-night -o diagram.svg
  cat spec.md | ariel --ascii --color none`;

if (hasFlag("-h", "--help")) {
  console.log(HELP);
  process.exit(0);
}

if (hasFlag("-v", "--version")) {
  console.log(`ariel ${VERSION}`);
  process.exit(0);
}

if (hasFlag("--list-themes")) {
  const names = Object.keys(THEMES);
  const maxLen = Math.max(...names.map((n) => n.length));
  console.log("Available themes:\n");
  for (const name of names) {
    const t = THEMES[name]!;
    const pad = " ".repeat(maxLen - name.length);
    const tag = isDark(t.bg) ? "dark" : "light";
    console.log(`  ${name}${pad}  ${tag}   bg:${t.bg} fg:${t.fg}`);
  }
  process.exit(0);
}

function isDark(hex: string): boolean {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

// ============================================================================
// Read input
// ============================================================================

async function readInput(): Promise<string> {
  const file = getPositionalFile();

  if (file) {
    try {
      return await Bun.file(file).text();
    } catch (e: any) {
      console.error(`ariel: cannot read '${file}': ${e.message}`);
      process.exit(1);
    }
  }

  // stdin
  if (Bun.stdin.stream) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of Bun.stdin.stream()) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf-8");
    if (!text.trim()) {
      console.error("ariel: no input (pipe a diagram or pass a file)");
      console.error("       try: ariel --help");
      process.exit(1);
    }
    return text;
  }

  console.error("ariel: no input (pipe a diagram or pass a file)");
  console.error("       try: ariel --help");
  process.exit(1);
}

// ============================================================================
// Render
// ============================================================================

const input = await readInput();
const outputFile = getFlagValue("-o", "--output");
const isSvg = hasFlag("--svg");

let output: string;

try {
  if (isSvg) {
    const themeName = getFlagValue("--theme");
    let colors: DiagramColors | undefined;
    if (themeName) {
      colors = THEMES[themeName];
      if (!colors) {
        console.error(
          `ariel: unknown theme '${themeName}' (use --list-themes to see available)`
        );
        process.exit(1);
      }
    }
    output = renderMermaidSVG(input, colors ?? {});
  } else {
    const colorMode = getFlagValue("--color") ?? "auto";
    const validModes = ["auto", "none", "ansi16", "ansi256", "truecolor"];
    if (!validModes.includes(colorMode)) {
      console.error(
        `ariel: invalid color mode '${colorMode}' (use: ${validModes.join(", ")})`
      );
      process.exit(1);
    }

    // Auto-detect terminal background for theme selection
    const isDarkBg = hasFlag("--light")
      ? false
      : hasFlag("--dark")
        ? true
        : await detectDarkBackground();

    const opts: AsciiRenderOptions = {
      useAscii: hasFlag("--ascii"),
      colorMode: colorMode as AsciiRenderOptions["colorMode"],
      theme: isDarkBg ? DARK_ASCII_THEME : LIGHT_ASCII_THEME,
      paddingX: getFlagValue("--padding-x")
        ? parseInt(getFlagValue("--padding-x")!)
        : undefined,
      paddingY: getFlagValue("--padding-y")
        ? parseInt(getFlagValue("--padding-y")!)
        : undefined,
    };

    output = renderMermaidASCII(input, opts);
  }
} catch (e: any) {
  console.error(`ariel: render error: ${e.message}`);
  process.exit(1);
}

// ============================================================================
// Output
// ============================================================================

if (outputFile) {
  await Bun.write(outputFile, output);
} else {
  process.stdout.write(output);
  // Add trailing newline if output doesn't end with one
  if (!output.endsWith("\n")) process.stdout.write("\n");
}
