# fid2ofx - Fiducial CSV to OFX

## Description

Converts [Fiducial Bank](https://www.fiducial.fr/BanquePro) CSV exports to the [OFX (Open Financial Exchange)](https://en.wikipedia.org/wiki/Open_Financial_Exchange) format (QuickBooks, Microsoft Money, Intuit, Quicken…)

## Use

### CLI

1. Install dependencies: `npm i`
2. Build: `npm run build` (or run directly through ts-node: `./node_modules/.bin/ts-node bin/fid2ofx.ts`)
3. Run: `npm run fid2ofx` or `node bin/fid2ofx.js`

### CLI options

```
--help          Show help                                            [boolean]
--version       Show version number                                  [boolean]
--csv           CSV file                                   [string] [required]
--last-balance  Account balance at last operation          [number] [required]
```
