import { ref, watch } from 'vue'

const STORAGE_KEY = 'pw-theme'

const isDark = ref(true)

// Init from localStorage
const stored = localStorage.getItem(STORAGE_KEY)
if (stored !== null) {
  isDark.value = stored === 'dark'
} else {
  // Default to dark
  isDark.value = true
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
}

// Apply immediately
applyTheme(isDark.value)

export function useTheme() {
  const toggle = () => {
    isDark.value = !isDark.value
  }

  watch(isDark, (val) => {
    applyTheme(val)
  })

  return {
    isDark,
    toggle
  }
}
