# Dynara monorepo

A Bun-powered monorepo for the [Dynara](packages/dynara) HTTP framework.

## Packages

| Package | Description |
| --- | --- |
| [`dynara`](packages/dynara) | The published HTTP framework. See its [README](packages/dynara/README.md). |
| `dynara-dev-app` | Local playground app used to develop and try out the framework. Not published. |

## Getting started

```sh
bun install
```

## Scripts

Run from the repository root:

```sh
bun run dev      # start the dev-app (bun --watch) against the local dynara sources
bun run build    # build the dynara package
bun run release  # bump the dynara patch version
```

You can also target a single package directly with Bun's workspace filter, e.g.
`bun --filter 'dynara' build`.
