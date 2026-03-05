# ariel

Render Mermaid diagrams in your terminal. Powered by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid).

```
echo -e 'graph LR\n  A --> B --> C' | ariel

┌───┐     ┌───┐     ┌───┐
│   │     │   │     │   │
│ A ├────►│ B ├────►│ C │
│   │     │   │     │   │
└───┘     └───┘     └───┘
```

## Install

```bash
bun build cli.ts --compile --outfile ariel
cp ariel ~/.local/bin/  # or wherever you keep binaries
```

## Usage

```bash
# Pipe from stdin
echo -e 'graph LR\n  A --> B --> C' | ariel
cat diagram.mmd | ariel

# Read from file
ariel diagram.mmd

# ASCII mode (pure +,-,| characters)
ariel diagram.mmd --ascii

# SVG output with themes
ariel diagram.mmd --svg --theme tokyo-night -o diagram.svg

# List themes
ariel --list-themes

# Control color output
ariel diagram.mmd --color none        # plain text, no ANSI
ariel diagram.mmd --color truecolor   # 24-bit RGB
```

Example agent instruction:
>`ariel` is available on PATH for rendering Mermaid diagrams. Use it to visualize data flows, architecture, state machines, etc. See the --help for details.

## Build

Requires [Bun](https://bun.sh).

```bash
bun install
bun run build
```

Produces a single `ariel` binary (~60MB, includes Bun runtime).
