import { config } from './config.js';
const link = document.querySelector('#service-link');
if (config.appsScriptUrl) {
  link.href = config.appsScriptUrl;
  link.hidden = false;
  document.querySelector('#service-status').textContent = 'Проверка откроется в отдельной вкладке.';
}
