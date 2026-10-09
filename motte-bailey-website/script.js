const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

toggle.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open navigation');
}));

document.getElementById('year').textContent = new Date().getFullYear();
const dateInput = document.getElementById('booking-date');
const localToday = new Date();
const dateOffset = localToday.getTimezoneOffset();
const today = new Date(localToday.getTime() - dateOffset * 60000).toISOString().slice(0, 10);
dateInput.min = today;

document.getElementById('reservation-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const subject = `Reservation enquiry — ${data.get('name')} — ${data.get('date')}`;
  const body = [
    'Hello Motte & Bailey team,', '',
    'I would like to enquire about a reservation with the following details:',
    `Name: ${data.get('name')}`,
    `Email: ${data.get('email')}`,
    `Preferred date: ${data.get('date')}`,
    `Preferred time: ${data.get('time')}`,
    `Guests: ${data.get('guests')}`,
    `Phone: ${data.get('phone') || 'Not provided'}`,
    `Additional notes: ${data.get('notes') || 'None'}`,
    '', 'Please let me know if this is available. Thank you.'
  ].join('\n');
  const feedback = document.getElementById('form-feedback');
  feedback.textContent = 'Your email app should open with the enquiry prepared. Please send it to complete your request; the restaurant must confirm the booking.';
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
});
