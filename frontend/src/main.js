import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Design tokens and component styles
import './styles/design-tokens.css'
import './styles/components.css'


const app = createApp(App)

app.use(router)

app.mount('#app')
