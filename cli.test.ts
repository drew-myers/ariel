import { describe, test, expect } from "bun:test";
import { $ } from "bun";

const cli = "bun run cli.ts";

async function run(
  args: string,
  stdin?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let result;
  if (stdin) {
    result = await $`echo ${stdin} | ${{ raw: cli }} ${{ raw: args }}`
      .nothrow()
      .quiet();
  } else {
    // Pipe empty string so CLI doesn't block waiting on tty
    result = await $`echo "" | ${{ raw: cli }} ${{ raw: args }}`
      .nothrow()
      .quiet();
  }
  return {
    stdout: result.text().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

// ============================================================================
// Help & meta
// ============================================================================

describe("help & version", () => {
  test("--help shows usage", async () => {
    const { stdout } = await run("--help");
    expect(stdout).toContain("ariel — render Mermaid diagrams in your terminal");
    expect(stdout).toContain("--svg");
    expect(stdout).toContain("--ascii");
    expect(stdout).toContain("--theme");
  });

  test("-h is an alias for --help", async () => {
    const { stdout } = await run("-h");
    expect(stdout).toContain("ariel — render Mermaid diagrams in your terminal");
  });

  test("--version shows version", async () => {
    const { stdout } = await run("--version");
    expect(stdout).toMatch(/^ariel \d+\.\d+\.\d+$/);
  });

  test("-v is an alias for --version", async () => {
    const { stdout } = await run("-v");
    expect(stdout).toMatch(/^ariel \d+\.\d+\.\d+$/);
  });
});

// ============================================================================
// List themes
// ============================================================================

describe("--list-themes", () => {
  test("lists all themes", async () => {
    const { stdout } = await run("--list-themes");
    expect(stdout).toContain("tokyo-night");
    expect(stdout).toContain("dracula");
    expect(stdout).toContain("catppuccin-mocha");
    expect(stdout).toContain("dark");
    expect(stdout).toContain("light");
  });
});

// ============================================================================
// Unicode rendering (default)
// ============================================================================

const FLOWCHART_LR = "graph LR\n  A --> B --> C";
const FLOWCHART_TD = "graph TD\n  A --> B";
const SEQUENCE = "sequenceDiagram\n  Alice->>Bob: Hello";

describe("unicode rendering", () => {
  test("flowchart LR via stdin", async () => {
    const { stdout } = await run("", FLOWCHART_LR);
    expect(stdout).toContain("┌───┐");
    expect(stdout).toContain("│ A ├");
    expect(stdout).toContain("│ B ├");
    expect(stdout).toContain("│ C │");
    expect(stdout).toContain("►");
  });

  test("flowchart TD via stdin", async () => {
    const { stdout } = await run("", FLOWCHART_TD);
    expect(stdout).toContain("│ A │");
    expect(stdout).toContain("│ B │");
    expect(stdout).toContain("▼");
  });

  test("sequence diagram", async () => {
    const { stdout } = await run("", SEQUENCE);
    expect(stdout).toContain("Alice");
    expect(stdout).toContain("Bob");
    expect(stdout).toContain("Hello");
  });

  test("reads from file", async () => {
    const tmp = "/tmp/ariel-test.mmd";
    await Bun.write(tmp, FLOWCHART_LR);
    const { stdout } = await run(tmp);
    expect(stdout).toContain("│ A ├");
    expect(stdout).toContain("│ C │");
  });
});

// ============================================================================
// ASCII rendering
// ============================================================================

describe("--ascii", () => {
  test("uses ASCII characters instead of unicode", async () => {
    const { stdout } = await run("--ascii", FLOWCHART_LR);
    expect(stdout).toContain("+---+");
    expect(stdout).toContain("| A |");
    expect(stdout).toContain("---->");
    expect(stdout).not.toContain("┌");
    expect(stdout).not.toContain("►");
  });
});

// ============================================================================
// SVG rendering
// ============================================================================

describe("--svg", () => {
  test("outputs SVG", async () => {
    const { stdout } = await run("--svg", FLOWCHART_LR);
    expect(stdout).toStartWith("<svg");
    expect(stdout).toContain("</svg>");
  });

  test("with --theme applies theme colors", async () => {
    const { stdout } = await run("--svg --theme tokyo-night", FLOWCHART_LR);
    expect(stdout).toContain("#1a1b26");
    expect(stdout).toContain("#a9b1d6");
  });

  test("unknown theme exits with error", async () => {
    const { exitCode, stderr } = await run(
      "--svg --theme not-a-theme",
      FLOWCHART_LR
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("unknown theme");
  });

  test("-o writes to file", async () => {
    const tmp = "/tmp/ariel-test-output.svg";
    await run(`--svg -o ${tmp}`, FLOWCHART_LR);
    const content = await Bun.file(tmp).text();
    expect(content).toStartWith("<svg");
    expect(content).toContain("</svg>");
  });
});

// ============================================================================
// Color modes
// ============================================================================

describe("--color", () => {
  test("none produces no ANSI escapes", async () => {
    const { stdout } = await run("--color none", FLOWCHART_LR);
    // eslint-disable-next-line no-control-regex
    expect(stdout).not.toMatch(/\x1b\[/);
  });

  test("invalid color mode exits with error", async () => {
    const { exitCode, stderr } = await run(
      "--color banana",
      FLOWCHART_LR
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("invalid color mode");
  });
});

// ============================================================================
// Error handling
// ============================================================================

describe("errors", () => {
  test("invalid mermaid syntax exits with error", async () => {
    const { exitCode, stderr } = await run("", "this is not mermaid");
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("render error");
  });

  test("missing file exits with error", async () => {
    const { exitCode, stderr } = await run("/tmp/ariel-does-not-exist.mmd");
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("cannot read");
  });
});
