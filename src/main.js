import './style.css';
import { games as initialGames } from './games.js';

let games = initialGames;

let ratings = {};
let backlog = {};
let inProgress = {};
let index = 0;
let activeTab = 'discover';
let genre = 'All games';
let score = 8;
let profileName = 'Jordan Lee';
let loading = true;
let apiError = '';
let lastRenderedTab = null;

const app = document.querySelector('#app');
const poster = (g) => `<img src="${g.art}" alt="${g.title} key art" onerror="this.style.display='none';this.parentElement.classList.add('image-fallback')">`;
const currentPool = () => {
  const pool = games.filter(g => !ratings[g.id] && !backlog[g.id] && !inProgress[g.id] && (genre === 'All games' || g.genre === genre));
  if (!pool.length) return [];
  return pool.slice(index % pool.length).concat(pool.slice(0, index % pool.length));
};
const ratedGames = () => games.filter(g => ratings[g.id]).sort((a,b) => ratings[b.id].time - ratings[a.id].time);

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function persistPreferences() {
  await api('/preferences', {
    method: 'PUT',
    body: JSON.stringify({ activeTab, genre, score, deckIndex: index }),
  });
}

function render() {
  if (loading) {
    app.innerHTML = `<main class="loading-screen"><span class="brand-mark">S</span><p>${apiError || 'Opening your game shelf…'}</p>${apiError ? '<button id="retry-load">TRY AGAIN</button>' : ''}</main>`;
    document.querySelector('#retry-load')?.addEventListener('click', initialize);
    return;
  }
  const pool = currentPool();
  const g = pool[0];
  const rated = ratedGames();
  const wantToPlay = games.filter(g => backlog[g.id]).sort((a,b) => backlog[b.id].time - backlog[a.id].time);
  const activeGames = games.filter(g => inProgress[g.id]).sort((a,b) => inProgress[b.id].time - inProgress[a.id].time);
  const tabChanged = lastRenderedTab !== null && lastRenderedTab !== activeTab;
  const tabDirection = activeTab === 'shelf' ? 'enter-from-right' : 'enter-from-left';
  lastRenderedTab = activeTab;
  const average = rated.length ? (rated.reduce((sum, game) => sum + ratings[game.id].score, 0) / rated.length).toFixed(1) : '—';
  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" aria-label="Sidequest home"><span class="brand-mark">S<span>↗</span></span><span class="brand-name">sidequest<span class="brand-dot">.</span></span></a>
      <div class="side-label">YOUR SPACE</div>
      <nav class="side-nav" aria-label="Main navigation">
        <button class="nav-item ${activeTab==='discover'?'selected':''}" data-tab="discover"><span class="nav-icon">◉</span> Discover <span class="nav-count">${games.length - rated.length - wantToPlay.length - activeGames.length}</span></button>
        <button class="nav-item ${activeTab==='shelf'?'selected':''}" data-tab="shelf"><span class="nav-icon">▤</span> My shelf <span class="nav-count">${rated.length + wantToPlay.length + activeGames.length}</span></button>
      </nav>
      <div class="sidebar-bottom"><div class="avatar">${profileName.slice(0,1).toUpperCase()}</div><div class="user-copy"><b>${profileName}</b><span>PLAYER LEVEL 01</span></div><button class="more-button" aria-label="More options">···</button></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div class="breadcrumb">YOUR SPACE <span>/</span> ${activeTab === 'discover' ? 'DISCOVER' : 'MY SHELF'}</div><div class="top-actions"><span class="streak"><i>✳</i> <b>${rated.length}</b> rated</span><button class="help-button" aria-label="Help">?</button></div></header>
      <div class="tab-page ${tabChanged ? `tab-enter ${tabDirection}` : ''}">
        ${activeTab === 'discover' ? discoverView(g, pool.length, rated, average) : shelfView(rated, average, wantToPlay, activeGames)}
        <footer class="footer"><span>SIDEQUEST <span class="footer-sep">/</span> YOUR NEXT FAVORITE IS OUT THERE</span><span>MADE FOR THE LOVE OF PLAY <b>✳</b></span></footer>
      </div>
    </main>
  </div>`;
  bindEvents();
}

function discoverView(g, remaining, rated, average) {
  return `<section class="discover-page">
    <div class="intro-row"><div><div class="eyebrow"><span class="live-dot"></span> THE DISCOVERY LOOP <span class="eyebrow-line"></span></div><h1>Find your<br><span>next favorite.</span></h1><p class="intro-copy">A little less scrolling. A lot more <em>“one more run.”</em><br>Rate the games you’ve played. Meet the ones you haven’t.</p></div>
      <div class="mini-note"><div class="note-spark">✳</div><div><b>Your taste,</b><br><span>your own score.</span></div></div></div>
    <div class="discovery-layout">
      <div class="card-column"><div class="deck-heading"><div><span class="tiny-label">UP NEXT <span class="deck-index">/ ${String(Math.min(ratedGames().length + 1, games.length)).padStart(2,'0')}</span></span><div class="deck-subtitle">A pick for your next session</div></div><div class="deck-controls"><button class="round-control undo" aria-label="Undo last rating" ${!ratedGames().length?'disabled':''}>↶</button><button class="round-control" id="shuffle" aria-label="Shuffle games">⤨</button></div></div>
        ${g ? `<article class="game-card" id="game-card" style="--art-tint:${g.color}">${poster(g)}<div class="card-scrim"></div><div class="platforms"><span>◉ PC</span><span>◉ PS5</span></div><div class="critic-score"><b>${g.score}</b><span>CRITIC<br>SCORE</span></div><div class="card-content"><div class="game-kicker">${g.genre} <i>·</i> ${g.year}</div><h2>${g.title}</h2><div class="studio">${g.studio}</div><p>${g.description}</p><div class="tag-list">${g.tags.map(t=>`<span>${t}</span>`).join('')}</div><div class="card-bottom"><span class="duration">◷ &nbsp;${g.hours}</span><span class="card-number">${String(games.indexOf(g)+1).padStart(2,'0')} <i>/</i> ${String(games.length).padStart(2,'0')}</span></div></div><div class="swipe-stamp like-stamp">PLAY IT</div><div class="swipe-stamp pass-stamp">NOT FOR ME</div></article>
          <div class="swipe-actions"><button class="swipe-button pass" data-action="skip"><span>×</span><b>PASS</b><small>←</small></button><div class="score-dial"><div class="dial-top"><span>YOUR SCORE</span><b><strong id="score-value">${score}</strong><small>/10</small></b></div><div class="score-track"><input id="score-slider" type="range" min="1" max="10" value="${score}" style="--val:${score}" aria-label="Your game rating out of ten"><div class="score-ticks">${Array.from({length:10},(_,i)=>`<i class="${i<score?'filled':''}"></i>`).join('')}</div></div><div class="score-hint">DRAG TO RATE <span>THEN PICK</span></div></div><button class="swipe-button like" data-action="rate"><span>↗</span><b>RATE IT</b><small>→</small></button></div>
          <button class="not-played-button" data-action="backlog"><span>＋</span> HAVEN'T PLAYED YET <i>ADD TO YOUR LIST ↗</i></button>
          <button class="not-played-button in-progress-action" data-action="in-progress"><span>◷</span> NOT FINISHED YET <i>MOVE TO IN PROGRESS ↗</i></button>
          <div class="gesture-hint"><span>↔</span> &nbsp;SWIPE THE CARD OR USE THE BUTTONS</div>` : `<div class="empty-deck"><div>✳</div><h2>That’s a wrap.</h2><p>You’ve sorted every game in this stack. Remove one from your shelf if you want it back in Discover.</p><button id="reset-deck">RESET THE DECK ↺</button></div>`}
      </div>
      <aside class="discovery-rail"><div class="rail-card taste-card"><div class="rail-top"><span class="tiny-label">YOUR TASTE PROFILE</span><span class="spark-icon">✳</span></div><div class="taste-mark">${rated.length ? average : '—'}<small>/10</small></div><div class="taste-caption">YOUR AVERAGE SCORE</div><div class="rail-divider"></div><div class="taste-foot"><span>GAMES RATED</span><b>${String(rated.length).padStart(2,'0')} <i>/ ${games.length}</i></b></div><div class="progress-track"><i style="width:${(rated.length/games.length)*100}%"></i></div><div class="taste-message">${rated.length ? 'Your shelf is starting to look like you.' : 'Your shelf is waiting for its first rating.'}</div></div>
        <div class="rail-card how-card"><span class="tiny-label">HOW IT WORKS</span><div class="steps"><div class="step"><span class="step-num">01</span><div><b>Meet a game</b><p>Get a quick look at what it’s about.</p></div></div><div class="step"><span class="step-num">02</span><div><b>Make it yours</b><p>Set your score from 1 to 10.</p></div></div><div class="step"><span class="step-num">03</span><div><b>Build your shelf</b><p>Keep the games you love in one place.</p></div></div></div></div>
        <div class="filter-block"><span class="tiny-label">PICK A VIBE</span><div class="filters">${['All games','JRPG','RPG','Action RPG','Roguelike','Cozy sim','Adventure','Platformer','Metroidvania'].map(x=>`<button class="filter-chip ${genre===x?'active':''}" data-genre="${x}">${x}</button>`).join('')}</div></div>
      </aside>
    </div>
  </section>`;
}

function shelfView(rated, average, wantToPlay, activeGames) {
  const ratedShelf = rated.map(g=>`<article class="shelf-item" data-id="${g.id}"><div class="shelf-art" style="--art-tint:${g.color}">${poster(g)}<div class="shelf-rating">${ratings[g.id].score}<small>/10</small></div></div><div class="shelf-info"><div><b>${g.title}</b><span>${g.genre} · ${g.year}</span></div><button class="remove-rating" data-remove="${g.id}" aria-label="Remove rating for ${g.title}">···</button></div></article>`).join('');
  const backlogShelf = wantToPlay.map(g=>`<article class="shelf-item" data-id="${g.id}"><div class="shelf-art" style="--art-tint:${g.color}">${poster(g)}<div class="shelf-status">NOT PLAYED YET</div></div><div class="shelf-info"><div><b>${g.title}</b><span>${g.genre} · ${g.year}</span></div><button class="remove-rating" data-unbacklog="${g.id}" aria-label="Remove ${g.title} from your want-to-play list">···</button></div></article>`).join('');
  const inProgressShelf = activeGames.map(g=>`<article class="shelf-item" data-id="${g.id}"><div class="shelf-art" style="--art-tint:${g.color}">${poster(g)}<div class="shelf-status">IN PROGRESS</div></div><div class="shelf-info"><div><b>${g.title}</b><span>${g.genre} · ${g.year}</span></div><button class="remove-rating" data-unprogress="${g.id}" aria-label="Remove ${g.title} from In Progress">···</button></div></article>`).join('');
  return `<section class="shelf-page"><div class="eyebrow"><span class="live-dot"></span> YOUR PERSONAL COLLECTION <span class="eyebrow-line"></span></div><div class="shelf-header"><div><h1>Your game<br><span>shelf.</span></h1><p class="intro-copy">Every playthrough, every opinion. This is your list.</p></div><div class="shelf-stats"><div><b>${String(rated.length).padStart(2,'0')}</b><span>GAMES RATED</span></div><div><b>${average}<small>/10</small></b><span>YOUR AVERAGE</span></div><div><b>${String(wantToPlay.length).padStart(2,'0')}</b><span>WANT TO PLAY</span></div><div><b>${String(activeGames.length).padStart(2,'0')}</b><span>IN PROGRESS</span></div></div></div>
    ${rated.length ? `<div class="shelf-tools"><span>RATED · ${rated.length} GAME${rated.length===1?'':'S'}</span><span>MOST RECENT FIRST</span></div><div class="shelf-grid">${ratedShelf}</div>` : ''}
    ${wantToPlay.length ? `<div class="shelf-tools backlog-heading"><span>WANT TO PLAY · ${wantToPlay.length} GAME${wantToPlay.length===1?'':'S'}</span><span>WHEN YOU GET TO IT</span></div><div class="shelf-grid">${backlogShelf}</div>` : ''}
    ${activeGames.length ? `<div class="shelf-tools backlog-heading"><span>IN PROGRESS · ${activeGames.length} GAME${activeGames.length===1?'':'S'}</span><span>PICK UP WHERE YOU LEFT OFF</span></div><div class="shelf-grid">${inProgressShelf}</div>` : ''}
    ${!rated.length && !wantToPlay.length && !activeGames.length ? `<div class="shelf-empty"><span>▤</span><h2>Your shelf is a blank save file.</h2><p>Rate or save a few games in Discover, and they’ll show up here.</p><button data-tab="discover">GO FIND SOME GAMES ↗</button></div>` : ''}</section>`;
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',async()=>{ activeTab=b.dataset.tab; await persistPreferences(); render(); }));
  document.querySelectorAll('[data-genre]').forEach(b=>b.addEventListener('click',async()=>{ genre=b.dataset.genre; index=0; await persistPreferences(); render(); }));
  const slider=document.querySelector('#score-slider');
  if(slider) slider.addEventListener('input',()=>{score=Number(slider.value);slider.style.setProperty('--val',score);document.querySelector('#score-value').textContent=score;document.querySelectorAll('.score-ticks i').forEach((tick,i)=>tick.classList.toggle('filled',i<score));});
  if(slider) slider.addEventListener('change',()=>persistPreferences());
  const g=currentPool()[0];
  document.querySelector('[data-action="rate"]')?.addEventListener('click',()=>g&&saveRating(g,score));
  document.querySelector('[data-action="backlog"]')?.addEventListener('click',async()=>{if(g){await api(`/backlog/${g.id}`,{method:'POST'});backlog[g.id]={time:Date.now()};index=0;await persistPreferences();render();}});
  document.querySelector('[data-action="in-progress"]')?.addEventListener('click',async()=>{if(g){await api(`/in-progress/${g.id}`,{method:'POST'});delete backlog[g.id];inProgress[g.id]={time:Date.now()};index=0;await persistPreferences();render();}});
  document.querySelector('[data-action="skip"]')?.addEventListener('click',async()=>{if(g){await api('/events',{method:'POST',body:JSON.stringify({gameId:g.id,action:'pass'})});index++;await persistPreferences();render();}});
  document.querySelector('#shuffle')?.addEventListener('click',async()=>{index+=2;await persistPreferences();render();});
  document.querySelector('#reset-deck')?.addEventListener('click',async()=>{index=0;genre='All games';await persistPreferences();render();});
  document.querySelector('.undo')?.addEventListener('click',async()=>{const last=ratedGames()[0];if(last){await api(`/ratings/${last.id}`,{method:'DELETE'});await api('/events',{method:'POST',body:JSON.stringify({gameId:last.id,action:'undo'})});delete ratings[last.id];index=0;await persistPreferences();render();}});
  document.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',async()=>{await api(`/ratings/${b.dataset.remove}`,{method:'DELETE'});delete ratings[b.dataset.remove];render();}));
  document.querySelectorAll('[data-unbacklog]').forEach(b=>b.addEventListener('click',async()=>{await api(`/backlog/${b.dataset.unbacklog}`,{method:'DELETE'});delete backlog[b.dataset.unbacklog];render();}));
  document.querySelectorAll('[data-unprogress]').forEach(b=>b.addEventListener('click',async()=>{await api(`/in-progress/${b.dataset.unprogress}`,{method:'DELETE'});delete inProgress[b.dataset.unprogress];render();}));
  const card=document.querySelector('#game-card');
  if(card){let start=0;card.addEventListener('pointerdown',e=>{start=e.clientX;card.setPointerCapture(e.pointerId);});card.addEventListener('pointerup',e=>{const delta=e.clientX-start;if(Math.abs(delta)>65){if(delta>0)saveRating(g,score);else{index++;render();}}});}
}
async function saveRating(g, value) {
  await api(`/ratings/${g.id}`, { method: 'PUT', body: JSON.stringify({ score: value }) });
  ratings[g.id] = { score: value, time: Date.now() };
  index = 0;
  score = 8;
  await persistPreferences();
  render();
}

async function initialize() {
  loading = true;
  apiError = '';
  render();
  try {
    const state = await api('/state');
    games = state.games;
    ratings = state.ratings;
    backlog = state.backlog;
    inProgress = state.inProgress;
    profileName = state.profile.name;
    activeTab = state.preferences.activeTab;
    genre = state.preferences.genre;
    score = state.preferences.score;
    index = state.preferences.deckIndex;
    loading = false;
    render();
  } catch (error) {
    loading = true;
    apiError = 'Could not connect to Sidequest’s database. Check that the Express server is running.';
    console.error(error);
    render();
  }
}

initialize();
