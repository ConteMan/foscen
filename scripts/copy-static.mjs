import { cp, mkdir } from 'node:fs/promises'

const sourceRoot = new URL('../src/', import.meta.url)
const outputRoot = new URL('../dist/', import.meta.url)
const brandMark = new URL('../assets/brand/foscen-mark.svg', import.meta.url)

for (const directory of ['renderer', 'scene', 'window-chrome']) {
  await mkdir(new URL(`${directory}/`, outputRoot), { recursive: true })

  for (const file of ['index.html', 'styles.css']) {
    await cp(
      new URL(`${directory}/${file}`, sourceRoot),
      new URL(`${directory}/${file}`, outputRoot),
    )
  }
}

await cp(brandMark, new URL('renderer/foscen-mark.svg', outputRoot))

console.log('Copied renderer, scene, window chrome static assets, and brand mark.')
