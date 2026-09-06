const screens = [...document.querySelectorAll('.screen')];
const sheet = document.querySelector('#add-sheet');
const scrim = document.querySelector('#scrim');

function setSheet(open) {
  sheet.classList.toggle('active', open);
  scrim.classList.toggle('active', open);
}

function show(name) {
  const target = document.querySelector(`#screen-${name}`);
  if (!target) return;
  screens.forEach((screen) => screen.classList.toggle('active', screen === target));
  document.querySelectorAll('.suite-item').forEach((item) => item.classList.toggle('active', item.dataset.nav === name || (name !== 'search' && item.dataset.nav === 'control')));
  setSheet(false);
  history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => show(button.dataset.nav)));
document.querySelector('#project-control').addEventListener('click', () => { show('control'); setSheet(true); });
document.querySelector('#close-sheet').addEventListener('click', () => setSheet(false));
scrim.addEventListener('click', () => setSheet(false));
document.querySelector('#add-form').addEventListener('submit', (event) => { event.preventDefault(); document.querySelector('#project-name').textContent = 'Harbor Relay'; show('scan'); });

document.querySelectorAll('[data-disposition]').forEach((button) => button.addEventListener('click', () => {
  const card = button.closest('[data-candidate]');
  const status = button.dataset.disposition.toUpperCase();
  card.querySelector('.candidate-state').textContent = status === 'INFORMATION' ? 'INFO ONLY' : status;
  card.classList.remove('pending', 'accepted');
  if (status === 'ACCEPTED') card.classList.add('accepted');
}));

const initial = location.hash.slice(1);
if (initial && initial !== 'add') show(initial);
else { show('control'); setSheet(true); }
