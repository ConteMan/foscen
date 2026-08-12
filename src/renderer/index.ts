const form = document.querySelector<HTMLFormElement>('[data-navigation-form]')
const input = document.querySelector<HTMLInputElement>('[data-url-input]')
const error = document.querySelector<HTMLElement>('[data-error]')

if (!form || !input || !error) {
  throw new Error('Foscen chrome markup is incomplete')
}

const setError = (message: string): void => {
  error.textContent = message
  error.hidden = message.length === 0
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  setError('')

  const result = await window.foscen.navigate(input.value)
  if (!result.ok) {
    setError(result.error)
  }
})

document.querySelector('[data-back]')?.addEventListener('click', () => {
  void window.foscen.goBack()
})

document.querySelector('[data-forward]')?.addEventListener('click', () => {
  void window.foscen.goForward()
})

document.querySelector('[data-reload]')?.addEventListener('click', () => {
  void window.foscen.reload()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    void window.foscen.dismissChrome()
  }
})

window.foscen.onShowChrome((currentUrl) => {
  input.value = currentUrl
  setError('')
  input.focus()
  input.select()
})

void window.foscen.rendererReady()
