export function dashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenAI Crawler Dashboard</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #0b1020; color: #eef2ff; }
    main { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 16px; }
    h2 { margin-top: 32px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .card { background: #151b31; border: 1px solid #26304f; border-radius: 14px; padding: 16px; box-shadow: 0 12px 32px rgba(0,0,0,.2); }
    .metric { font-size: 30px; font-weight: 750; }
    .muted { color: #9aa6c7; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; background: #151b31; border-radius: 14px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #26304f; font-size: 14px; }
    th { color: #aeb9dd; background: #11172a; }
    input, select, button { border: 1px solid #344064; background: #0f1528; color: #eef2ff; border-radius: 10px; padding: 9px 10px; }
    button { cursor: pointer; background: #3346ff; border-color: #5060ff; font-weight: 700; }
    button.secondary { background: #202840; border-color: #344064; }
    form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .pill { display: inline-flex; border-radius: 999px; padding: 3px 8px; background: #202840; color: #cad4f6; font-size: 12px; }
    .ok { color: #80ffbf; } .bad { color: #ff9aa8; } .warn { color: #ffd580; }
  </style>
</head>
<body>
  <main>
    <h1>OpenAI Crawler Dashboard</h1>
    <p class="muted">Local autonomous Reddit crawler monitor. Main targets stay on schedule; idle capacity crawls discovered users and verified NSFW subreddits.</p>

    <section class="grid" id="metrics"></section>

    <h2>Accounts</h2>
    <form id="account-form">
      <input name="label" placeholder="Label" />
      <input name="username" placeholder="Username" />
      <input name="loginSecret" placeholder="Password" type="password" />
      <input name="sessionCookie" placeholder="reddit_session cookie" style="min-width:280px" />
      <button>Add account</button>
    </form>
    <div id="accounts"></div>

    <h2>Main subreddits</h2>
    <form id="subreddit-form">
      <input name="name" placeholder="subreddit name" />
      <button>Add main subreddit</button>
    </form>
    <div id="main-subreddits"></div>

    <h2>Queue</h2>
    <div id="tasks"></div>

    <h2>Recent runs</h2>
    <div id="runs"></div>
  </main>
<script>
async function api(path, options) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function table(rows, columns) {
  if (!rows.length) return '<p class="muted">Nothing yet.</p>';
  return '<table><thead><tr>' + columns.map(c => '<th>' + c.label + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(row => '<tr>' + columns.map(c => '<td>' + c.render(row) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}

function taskLabel(task) {
  if (task.type === 'home') return 'home / ' + task.sort;
  if (task.type === 'subredditDetails') return 'r/' + task.target + ' / details';
  if (task.type === 'subreddit') return 'r/' + task.target + ' / ' + task.sort;
  return 'u/' + task.target + ' / submitted';
}

async function refresh() {
  const state = await api('/api/state');
  document.getElementById('metrics').innerHTML = [
    ['Accounts', state.counts.accounts],
    ['Tracked NSFW subs', state.counts.subreddits],
    ['Users', state.counts.users],
    ['Posts', state.counts.posts],
    ['Queued tasks', state.counts.queuedTasks],
    ['Running tasks', state.counts.runningTasks],
    ['Candidates', state.counts.candidates],
    ['Runs', state.counts.runs]
  ].map(([label, value]) => '<div class="card"><div class="metric">' + value + '</div><div class="muted">' + label + '</div></div>').join('');

  document.getElementById('accounts').innerHTML = table(state.accounts, [
    { label: 'Label', render: a => a.label },
    { label: 'Username', render: a => a.username || '<span class="muted">session only</span>' },
    { label: 'Status', render: a => '<span class="pill">' + a.status + '</span>' },
    { label: 'Enabled', render: a => a.enabled ? '<span class="ok">yes</span>' : '<span class="bad">no</span>' },
    { label: 'Action', render: a => '<button class="secondary" onclick="toggleAccount(\'' + a.id + '\',' + (!a.enabled) + ')">' + (a.enabled ? 'Disable' : 'Enable') + '</button>' }
  ]);

  document.getElementById('main-subreddits').innerHTML = table(state.mainSubreddits, [
    { label: 'Subreddit', render: s => 'r/' + s.name },
    { label: 'Enabled', render: s => s.enabled ? '<span class="ok">yes</span>' : '<span class="bad">no</span>' },
    { label: 'Action', render: s => '<button class="secondary" onclick="toggleMainSubreddit(\'' + s.name + '\',' + (!s.enabled) + ')">' + (s.enabled ? 'Disable' : 'Enable') + '</button>' }
  ]);

  document.getElementById('tasks').innerHTML = table(state.tasks, [
    { label: 'Task', render: t => taskLabel(t.task) },
    { label: 'Status', render: t => '<span class="pill">' + t.status + '</span>' },
    { label: 'Priority', render: t => String(t.priority) },
    { label: 'Due', render: t => new Date(t.dueAt).toLocaleString() },
    { label: 'Attempts', render: t => String(t.attempts) }
  ]);

  document.getElementById('runs').innerHTML = table(state.runs, [
    { label: 'Task', render: r => taskLabel(r.task) },
    { label: 'Status', render: r => r.status === 'ok' ? '<span class="ok">ok</span>' : '<span class="bad">failed</span>' },
    { label: 'Posts', render: r => String(r.postCount) },
    { label: 'Users', render: r => String(r.userCount) },
    { label: 'Subs', render: r => String(r.subredditCount) },
    { label: 'Finished', render: r => new Date(r.finishedAt).toLocaleString() }
  ]);
}

async function toggleAccount(id, enabled) {
  await api('/api/accounts/' + id, { method: 'PATCH', body: JSON.stringify({ enabled }) });
  await refresh();
}

async function toggleMainSubreddit(name, enabled) {
  await api('/api/main-subreddits/' + encodeURIComponent(name), { method: 'PATCH', body: JSON.stringify({ enabled }) });
  await refresh();
}

document.getElementById('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await api('/api/accounts', { method: 'POST', body: JSON.stringify(data) });
  event.currentTarget.reset();
  await refresh();
});

document.getElementById('subreddit-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await api('/api/main-subreddits', { method: 'POST', body: JSON.stringify(data) });
  event.currentTarget.reset();
  await refresh();
});

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}
