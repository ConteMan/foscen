import { rm } from 'node:fs/promises'

const outputRoot = new URL('../dist/', import.meta.url)

await rm(outputRoot, { force: true, recursive: true })
