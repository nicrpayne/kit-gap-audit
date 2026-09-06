const screens = [...document.querySelectorAll('.screen')];
const railItems = [...document.querySelectorAll('.rail-item')];
const topCrumb = document.querySelector('.crumb');

function show(name) {
  const target = document.querySelector(`#screen-${name}`);
  if (!target) return;
  screens.forEach((screen) => screen.classList.toggle('active', screen === target));
  railItems.forEach((item) => item.classList.toggle('active', item.dataset.screen === name));
  topCrumb.textContent = target.dataset.title || 'Harbor Relay';
  history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

railItems.forEach((item) => item.addEventListener('click', () => show(item.dataset.screen)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => show(button.dataset.go)));
document.querySelector('#add-form').addEventListener('submit', (event) => { event.preventDefault(); show('scan'); });
document.querySelector('#reset').addEventListener('click', () => { localStorage.removeItem('signal-bootstrap-prototype'); show('add'); });

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const card = button.closest('[data-candidate]');
    const disposition = card.querySelector('.disposition span');
    const action = button.dataset.action;
    const labels = { accept: 'ACCEPTED', defer: 'DEFERRED', reject: 'REJECTED', info: 'INFORMATION ONLY' };
    disposition.textContent = labels[action] || 'PENDING';
    card.classList.remove('pending', 'accepted');
    card.classList.add(action === 'accept' ? 'accepted' : 'pending');
    localStorage.setItem('signal-bootstrap-prototype', disposition.textContent);
  });
});

const dialog = document.querySelector('#evidence-dialog');
document.querySelectorAll('[data-open-evidence]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.openEvidence === 'checklist') {
      document.querySelector('#evidence-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    dialog.showModal();
  });
});
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelector('#close-evidence').addEventListener('click', () => document.querySelector('#evidence-panel').classList.toggle('closed'));

document.querySelector('#search-button').addEventListener('click', () => {
  const input = document.querySelector('#search-input');
  input.animate([{ outlineColor: 'transparent' }, { outlineColor: '#a397fa' }, { outlineColor: 'transparent' }], { duration: 500 });
});
document.querySelector('#search-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') document.querySelector('#search-button').click(); });

show(location.hash.slice(1) || 'add');
