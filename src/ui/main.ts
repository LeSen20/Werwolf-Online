// Pixelschrift selbst ausgeliefert (kein Abruf bei Google-Servern), Lizenz: public/licenses/pixelify-sans-OFL.txt
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import './styles.css';
import { App } from './app';

const root = document.getElementById('app');
if (root) new App(root).render();
