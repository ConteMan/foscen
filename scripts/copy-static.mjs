import { cp, mkdir } from 'node:fs/promises'

const sourceRoot = new URL('../src/', import.meta.url)
const outputRoot = new URL('../dist/', import.meta.url)

for (const directory of ['renderer', 'scene', 'window-chrome']) {
  await mkdir(new URL(`${directory}/`, outputRoot), { recursive: true })

  for (const file of ['index.html', 'styles.css']) {
    await cp(
      new URL(`${directory}/${file}`, sourceRoot),
      new URL(`${directory}/${file}`, outputRoot),
    )
  }
}

console.log('Copied renderer, scene, and window chrome static assets.')
