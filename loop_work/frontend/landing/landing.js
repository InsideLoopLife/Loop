(function () {
  const config = window.INSIDE_LOOP_CONFIG || {};
  const apiBase = config.apiBase || '';
  const $ = (selector) => document.querySelector(selector);

  function setStatus(id, text, ok) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = `status ${ok ? 'ok' : 'error'}`;
  }

  $('#accessForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = $('#accessCode').value;
    setStatus('#accessStatus', 'Checking access code...', true);
    try {
      const res = await fetch(`${apiBase}/api/beta/access/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.reason || json.error || 'Access code was not accepted.');
      $('#accessCard').classList.add('hidden');
      $('#loginCard').classList.remove('hidden');
      $('#signupForm input[name="code"]').value = code;
      setStatus('#signupStatus', 'Access accepted. Create your beta account.', true);
    } catch (error) {
      setStatus('#accessStatus', error.message, false);
    }
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}Form`)?.classList.add('active');
    });
  });

  $('#signupForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('#signupStatus', 'Creating account...', true);
    try {
      const res = await fetch(`${apiBase}/api/beta/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || json.reason || 'Could not create account.');
      setStatus('#signupStatus', 'Account created. You can log in now.', true);
      document.querySelector('.tab[data-tab="login"]').click();
      $('#loginForm input[name="email"]').value = form.get('email');
    } catch (error) {
      setStatus('#signupStatus', error.message, false);
    }
  });

  $('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.supabase || !config.supabaseUrl || config.supabaseUrl === 'YOUR_SUPABASE_URL') {
      setStatus('#loginStatus', 'Add your Supabase URL and anon key to the landing page config.', false);
      return;
    }
    const form = new FormData(event.currentTarget);
    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    setStatus('#loginStatus', 'Logging in...', true);
    const { error } = await client.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
    if (error) return setStatus('#loginStatus', error.message, false);
    setStatus('#loginStatus', 'Logged in. Redirecting...', true);
    window.location.href = '/app';
  });
})();
