#!/usr/bin/env bun
// ariel — CLI for beautiful-mermaid
// Renders Mermaid diagrams as ASCII/Unicode art or SVG

import {
  renderMermaidASCII,
  renderMermaidSVG,
  THEMES,
} from "beautiful-mermaid";
import type { AsciiRenderOptions } from "beautiful-mermaid";
import type { DiagramColors } from "beautiful-mermaid";

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

    const opts: AsciiRenderOptions = {
      useAscii: hasFlag("--ascii"),
      colorMode: colorMode as AsciiRenderOptions["colorMode"],
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
