# Marci monorepo

A Bun-powered monorepo for the [Marci](packages/marci) HTTP framework.

## Packages

| Package | Description |
| --- | --- |
| [`@den59k/marci`](packages/marci) | The published HTTP framework. See its [README](packages/marci/README.md). |
| `@den59k/dev-app` | Local playground app used to develop and try out the framework. Not published. |

## Getting started

```sh
bun install
```

## Scripts

Run from the repository root:

```sh
bun run dev      # start the dev-app (bun --watch) against the local marci sources
bun run build    # build the @den59k/marci package
bun run release  # bump the @den59k/marci patch version
```

You can also target a single package directly with Bun's workspace filter, e.g.
`bun --filter '@den59k/marci' build`.
