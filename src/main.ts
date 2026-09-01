const app = document.querySelector<HTMLElement>('#app');

if (!app) throw new Error('#app is missing from index.html');

app.textContent = 'Raftlab';
