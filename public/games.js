import { initializeFrontier } from './frontier.js';

const games = [
  { id: 'pulse-run', name: 'Pulse Run', genre: 'DODGE / SURVIVE', mark: '01', description: 'Slip through a storm of unruly signals. Stay in the field for 25 seconds.' },
  { id: 'archive-walk', name: 'Archive Walk', genre: 'EXPLORE / PUZZLE', mark: '02', description: 'Find three lost data motes in a quiet machine-city, then reach its exit.' },
  { id: 'beat-relay', name: 'Beat Relay', genre: 'RHYTHM / RECALL', mark: '03', description: 'Read the four-note phrase, then tap it back in time with the relay.' },
  { id: 'drift-duel', name: 'Fracturebound', genre: 'REALM RPG / TURN-BASED', mark: '04', description: 'Cross an original stitched-realm campaign, make route choices, and outthink its gatekeepers.' },
  { id: 'echo-cabinet', name: 'Resonance Grove', genre: 'DISCOVER / COMPANIONS', mark: '05', description: 'Find original signal-beings and field fauna, each with a distinct affinity and trace.' },
  { id: 'ashen-frontier', name: 'Dustwake Frontier', genre: '3D FRONTIER / EXPLORE / CATCH', mark: '06', description: 'Explore a block-built, fogbound wilderness, track roaming fauna, and catch companions to expand your field catalog.' }
];

const echoSpecies = [
  { id: 'velvet-static', name: 'Velvet Static', glyph: '≈', type: 'HUSH', tones: [0, 2, 1], note: 'Soft, steady, and hard to hold.', skill: 'Quiet Field', power: 10, effect: 'The next hit is softened.' },
  { id: 'lantern-drift', name: 'Lantern Drift', glyph: '◇', type: 'GLOW', tones: [2, 0, 2], note: 'A warm glimmer that wanders off-beat.', skill: 'Lumen Arc', power: 17, effect: 'A high-power flare.' },
  { id: 'tin-lullaby', name: 'Tin Lullaby', glyph: '⌁', type: 'METAL', tones: [1, 1, 0], note: 'A tiny refrain with a stubborn ending.', skill: 'Rivet Chorus', power: 12, effect: 'The chorus restores one spark.' },
  { id: 'rain-circuit', name: 'Rain Circuit', glyph: '╱', type: 'TIDE', tones: [0, 1, 2], note: 'Three drops falling through a wire.', skill: 'Rainline', power: 12, effect: 'A clean hit restores 5 HP.' },
  { id: 'morrow-hum', name: 'Morrow Hum', glyph: '∿', type: 'DUSK', tones: [2, 1, 0], note: 'A low note from somewhere not yet built.', skill: 'Low Forecast', power: 11, effect: 'The next hit is softened.' },
  { id: 'paper-comet', name: 'Paper Comet', glyph: '✳', type: 'WIND', tones: [1, 2, 1], note: 'A bright little scrape across the dark.', skill: 'Slipstream', power: 13, effect: 'A balanced strike with a guard.' },
  { id: 'cinder-fox', name: 'Cinderfox', glyph: '⌁', type: 'EMBER', tones: [2, 0, 1], note: 'A quick-footed fox that nests near warm stone.', skill: 'Kindle Dash', power: 14, effect: 'A swift ember strike.' },
  { id: 'mossback-grazer', name: 'Mossback Grazer', glyph: '▰', type: 'MOSS', tones: [0, 1, 1], note: 'A gentle, broad-backed grazer carrying its own garden.', skill: 'Thicket Guard', power: 9, effect: 'A sturdy strike and guard.' },
  { id: 'glasswing-moth', name: 'Glasswing Moth', glyph: '✧', type: 'PRISM', tones: [1, 0, 2], note: 'A translucent moth that drifts toward old lanterns.', skill: 'Shiverlight', power: 16, effect: 'A bright, focused burst.' },
  { id: 'brinekip', name: 'Brinekip', glyph: '◉', type: 'BRINE', tones: [0, 2, 0], note: 'A curious marsh-hopper with a salt-crystal crest.', skill: 'Tide Skip', power: 12, effect: 'A strike that restores 5 HP.' },
  { id: 'thunder-ram', name: 'Thunder Ram', glyph: '⟁', type: 'STORM', tones: [2, 2, 0], note: 'A sure-footed cliff runner with a crackling crown.', skill: 'Ridge Charge', power: 15, effect: 'A heavy, guarded blow.' },
  { id: 'dusk-owl', name: 'Dusk Owl', glyph: '◒', type: 'SHADE', tones: [1, 2, 0], note: 'A quiet watcher that hunts in the blue hour.', skill: 'Afterglow', power: 13, effect: 'A measured strike and guard.' }
];
const toneNames = ['LOW', 'MID', 'HIGH'];
const toneGlyphs = ['●', '◆', '▲'];
const affinityAdvantages = {
  HUSH: 'GLOW',
  GLOW: 'METAL',
  METAL: 'TIDE',
  TIDE: 'DUSK',
  DUSK: 'WIND',
  WIND: 'EMBER',
  EMBER: 'MOSS',
  MOSS: 'PRISM',
  PRISM: 'BRINE',
  BRINE: 'STORM',
  STORM: 'SHADE',
  SHADE: 'HUSH'
};

let apiClient = null;
let gameSocket = null;
let gameUser = {};
let savedProfile = { xp: 0, level: 1, credits: 0, echoes: [], storyChapter: 1, settings: { music: 0.25, effects: 0.65 } };
let audioContext = null;
let musicTimer = null;
let musicStep = 0;
let musicVolume = 0.25;
let effectsVolume = 0.65;
let currentLobby = null;
let lobbyListNode = null;
let currentLobbyNode = null;
let lobbyNoticeNode = null;
let menuCollectionNode = null;

const make = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function makeButton(text, className, action) {
  const button = make('button', className, text);
  button.type = 'button';
  button.addEventListener('click', (event) => {
    playEffect();
    action(event);
  });
  return button;
}

function playTone(frequency, duration, volume, waveform = 'sine') {
  if (volume <= 0) return;
  try {
    const context = getAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(Math.max(volume, 0.001), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch (error) {
    console.warn('Arcade audio could not start.', error);
  }
}

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext ||= new AudioContext();
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch((error) => console.warn('Arcade audio could not resume.', error));
  }
  return audioContext;
}

function playEffect() {
  playTone([440, 554, 659][Math.floor(Math.random() * 3)], 0.08, effectsVolume * 0.12, 'square');
}

function startMusic() {
  if (musicTimer) return;
  if (!getAudioContext()) return;
  musicTimer = window.setInterval(() => {
    const notes = [130.81, 164.81, 196, 146.83, 220, 196];
    playTone(notes[musicStep++ % notes.length], 0.52, musicVolume * 0.045, 'triangle');
  }, 720);
}

function stopMusic() {
  if (musicTimer) window.clearInterval(musicTimer);
  musicTimer = null;
}

function updateSavedProfile(nextProfile) {
  if (!nextProfile) return;
  savedProfile = { ...savedProfile, ...nextProfile, settings: { ...savedProfile.settings, ...nextProfile.settings } };
  musicVolume = savedProfile.settings.music;
  effectsVolume = savedProfile.settings.effects;
  if (lobbyNoticeNode) lobbyNoticeNode.textContent = `LEVEL ${savedProfile.level}  ·  CHAPTER ${savedProfile.storyChapter}  ·  ${savedProfile.xp} XP  ·  ${savedProfile.credits} CREDITS`;
}

async function awardCompletion(gameId, statusNode) {
  if (!apiClient) return;
  const completionLabel = statusNode?.textContent || 'GAME COMPLETE';
  try {
    const result = await apiClient('/api/games/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, claimId: crypto.randomUUID() })
    });
    updateSavedProfile(result.profile);
    if (statusNode) statusNode.textContent = `${completionLabel}  ·  +${result.reward.xp} XP / +${result.reward.credits} CREDITS`;
    else if (lobbyNoticeNode) lobbyNoticeNode.textContent = `+${result.reward.xp} XP  ·  +${result.reward.credits} CREDITS`;
  } catch (error) {
    if (statusNode) statusNode.textContent = `${completionLabel}  ·  PROGRESS SAVE FAILED: ${error.message}`;
    else if (lobbyNoticeNode) lobbyNoticeNode.textContent = `PROGRESS SAVE FAILED: ${error.message}`;
  }
}

async function saveStoryChoice(choiceId, statusNode) {
  if (!apiClient) return;
  const message = statusNode?.textContent || 'ROUTE SELECTED';
  try {
    const result = await apiClient('/api/games/story/choice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choiceId })
    });
    updateSavedProfile(result.profile);
    if (statusNode) statusNode.textContent = `${message}  ·  CHAPTER ${result.profile.storyChapter} SAVED`;
  } catch (error) {
    if (statusNode) statusNode.textContent = `${message}  ·  STORY SAVE FAILED: ${error.message}`;
  }
}

export function initializeArcade({ api, socket, user, shell: arcadeShell } = {}) {
  apiClient = api || null;
  gameSocket = socket || null;
  gameUser = user || {};
  const shell = arcadeShell || document.querySelector('#arcade-shell');
  if (!shell) return;
  let activeGame = null;
  let cancelActiveGame = () => {};

  function showMenu() {
    cancelActiveGame();
    cancelActiveGame = () => {};
    activeGame = null;
    shell.replaceChildren();
    const online = make('section', 'arcade-online-panel');
    const onlineHeader = make('div', 'arcade-online-header');
    const profileReadout = make('p', 'arcade-status', 'LOADING SAVED PROGRESS');
    lobbyNoticeNode = profileReadout;
    onlineHeader.append(make('h2', '', 'PILOT RECORD'), profileReadout);
    const settings = makeButton('SOUND SETTINGS', 'arcade-back', openSettings);
    onlineHeader.append(settings);
    online.append(onlineHeader);
    const lobbyControls = make('div', 'arcade-lobby-controls');
    lobbyControls.append(makeButton('HOST FRACTURE CO-OP', 'arcade-button', () => createLobby('fracture-run')));
    lobbyControls.append(makeButton('HOST RESONANCE CO-OP', 'arcade-button', () => createLobby('resonance-grove')));
    lobbyControls.append(makeButton('REFRESH ROOMS', 'arcade-back', refreshLobbies));
    online.append(lobbyControls);
    currentLobbyNode = make('div', 'arcade-current-lobby');
    lobbyListNode = make('div', 'arcade-lobby-list');
    online.append(currentLobbyNode, lobbyListNode);
    shell.append(online);
    const cabinets = make('div', 'arcade-cabinets');
    for (const game of games) {
      const card = make('article', 'arcade-cabinet');
      const mark = make('span', 'cabinet-mark', game.mark);
      const genre = make('span', 'cabinet-genre', game.genre);
      const title = make('h2', '', game.name);
      const description = make('p', '', game.description);
      const play = makeButton('OPEN CABINET  ↗', 'arcade-button', () => openGame(game.id));
      card.append(mark, genre, title, description, play);
      cabinets.append(card);
    }
    const shelf = make('section', 'arcade-shelf');
    shelf.append(make('p', 'arcade-eyebrow', 'RESONANCE GROVE / FIELD NOTES'));
    const collection = make('div', 'echo-collection');
    shelf.append(collection);
    menuCollectionNode = collection;
    shell.append(cabinets, shelf);
    renderCollection(collection);
    updateSavedProfile(savedProfile);
    refreshLobbies();
  }

  function openSettings() {
    shell.replaceChildren();
    const header = make('div', 'arcade-game-header');
    header.append(make('h2', '', 'AUDIO SETTINGS'));
    header.append(makeButton('← CABINET ROW', 'arcade-back', showMenu));
    const panel = make('section', 'arcade-settings');
    const status = make('p', 'arcade-status', 'Changes save to your pilot record.');
    for (const [key, label] of [['music', 'PROCEDURAL MUSIC'], ['effects', 'SOUND EFFECTS']]) {
      const wrapper = make('label', 'arcade-setting');
      const value = make('span', '', `${label}  ${Math.round(savedProfile.settings[key] * 100)}%`);
      const slider = make('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.05';
      slider.value = String(savedProfile.settings[key]);
      slider.setAttribute('aria-label', label);
      slider.addEventListener('input', () => {
        const volume = Number(slider.value);
        savedProfile.settings[key] = volume;
        if (key === 'music') musicVolume = volume;
        else effectsVolume = volume;
        value.textContent = `${label}  ${Math.round(volume * 100)}%`;
      });
      slider.addEventListener('change', async () => {
        if (!apiClient) {
          status.textContent = 'Settings changed for this visit; sign in to sync them.';
          return;
        }
        status.textContent = 'SAVING SETTINGS...';
        try {
          const result = await apiClient('/api/games/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: Number(slider.value) })
          });
          savedProfile.settings = { ...savedProfile.settings, ...result.settings };
          status.textContent = 'SETTINGS SAVED TO YOUR PILOT RECORD.';
        } catch (error) {
          status.textContent = `SETTINGS SAVE FAILED: ${error.message}`;
        }
      });
      wrapper.append(value, slider);
      panel.append(wrapper);
    }
    panel.append(make('p', 'arcade-help', 'Music is generated in your browser. No external tracks are loaded.'), status);
    shell.append(header, panel);
  }

  function refreshLobbies() {
    if (!lobbyListNode) return;
    if (!gameSocket?.connected) {
      lobbyListNode.replaceChildren(make('p', 'arcade-help', 'ONLINE ROOMS OFFLINE — reconnect to see active pilots.'));
      return;
    }
    gameSocket.emit('arcade:lobbies:list', (result) => {
      if (result?.error) {
        lobbyListNode.replaceChildren(make('p', 'arcade-help', result.error));
        return;
      }
      renderLobbyList(result?.lobbies || []);
    });
  }

  function renderLobbyList(lobbies) {
    if (!lobbyListNode) return;
    lobbyListNode.replaceChildren(make('p', 'arcade-eyebrow', 'OPEN ROOMS'));
    if (!lobbies.length) {
      lobbyListNode.append(make('p', 'arcade-help', 'No open rooms. Host one to invite other pilots.'));
      return;
    }
    for (const lobby of lobbies) {
      const item = make('div', 'arcade-lobby-row');
      const gameName = lobby.gameId === 'fracture-run' ? 'FRACTURE CO-OP' : 'RESONANCE CO-OP';
      item.append(make('span', '', `${gameName}  ·  ${lobby.players.length}/4`));
      item.append(makeButton('JOIN', 'arcade-back', () => joinLobby(lobby.id)));
      lobbyListNode.append(item);
    }
  }

  function renderCurrentLobby() {
    if (!currentLobbyNode) return;
    currentLobbyNode.replaceChildren();
    if (!currentLobby) return;
    const title = currentLobby.gameId === 'fracture-run' ? 'FRACTURE CO-OP ROOM' : 'RESONANCE CO-OP ROOM';
    currentLobbyNode.append(make('p', 'arcade-eyebrow', `${title}  ·  ${currentLobby.id.slice(0, 8)}`));
    const players = make('div', 'echo-collection');
    for (const player of currentLobby.players) {
      players.append(make('span', 'echo-entry', `${player.username} / ${player.character}${player.id === currentLobby.hostId ? ' / HOST' : ''}`));
    }
    currentLobbyNode.append(players);
    if (currentLobby.world) {
      const world = currentLobby.world;
      const summary = currentLobby.gameId === 'fracture-run'
        ? `CHAPTER ${world.chapter}  ·  TEAM SHIELDS ${world.teamShields}  ·  ${world.overdriveActive ? 'OVERDRIVE ACTIVE' : 'NORMAL SPEED'}`
        : world.echo
          ? `${world.echo.name} / ${world.echo.type}  ·  TARGET ${world.targetTrace.map((tone) => toneGlyphs[tone]).join(' ')}  ·  TRACE ${world.traceLength}/3  ·  CATALOG ${world.discoveries}`
          : `ALL SOUND-FORMS CATALOGED  ·  TEAM SHIELDS ${world.teamShields}`;
      currentLobbyNode.append(make('p', 'arcade-status', summary));
      if (world.lastOutcome) currentLobbyNode.append(make('p', 'arcade-help', world.lastOutcome));
      if (currentLobby.gameId === 'fracture-run') {
        const positions = make('p', 'arcade-help');
        positions.textContent = `PILOT POSITIONS: ${Object.entries(world.positions).map(([id, position]) => {
          const pilot = currentLobby.players.find((player) => player.id === id);
          return `${pilot?.username || 'Pilot'} (${position.x}, ${position.y})`;
        }).join('  ·  ')}`;
        currentLobbyNode.append(positions);
      }
    }
    const activity = make('p', 'arcade-status', currentLobby.lastActivity || `${currentLobby.players.length} PILOT(S) IN THE ROOM.`);
    currentLobbyNode.append(activity);
    if (currentLobby.gameId === 'fracture-run') {
      const actions = make('div', 'arcade-lobby-controls');
      for (const direction of ['north', 'south', 'east', 'west']) {
        actions.append(makeButton(direction.toUpperCase(), 'arcade-back', () => sendLobbyAction({ type: 'move', direction })));
      }
      for (const choiceId of ['listen', 'hold', 'cross']) {
        actions.append(makeButton(choiceId.toUpperCase(), 'arcade-button', () => sendLobbyAction({ type: 'choice', choiceId })));
      }
      currentLobbyNode.append(actions);
    } else {
      const actions = make('div', 'rhythm-pads');
      toneNames.forEach((tone, index) => actions.append(makeButton(`${toneGlyphs[index]} ${tone}`, `arcade-button tone-button tone-${index}`, () => sendLobbyAction({ type: 'tune', tone: index }))));
      currentLobbyNode.append(actions);
    }
    if (gameUser.isAdmin) {
      currentLobbyNode.append(make('p', 'arcade-eyebrow', 'ADMIN LOADOUT'));
      currentLobbyNode.append(makeButton('STABILIZE TEAM', 'arcade-button', () => sendAdminAbility('stabilize')));
      currentLobbyNode.append(makeButton('OVERDRIVE', 'arcade-button', () => sendAdminAbility('overdrive')));
    }
    if (gameUser.role === 'Owner') currentLobbyNode.append(makeButton('WORLD RECOMPILE', 'arcade-button', recompileWorld));
    currentLobbyNode.append(makeButton('LEAVE ROOM', 'arcade-back', leaveLobby));
  }

  function sendLobbyAction(action) {
    if (!gameSocket?.connected || !currentLobby) return;
    gameSocket.emit('arcade:lobby:action', { action }, (result) => {
      if (result?.error && lobbyNoticeNode) lobbyNoticeNode.textContent = result.error;
      else if (result?.progressionSaved === false && lobbyNoticeNode) lobbyNoticeNode.textContent = 'CO-OP PROGRESSED, BUT ONE OR MORE PILOT RECORDS COULD NOT BE SAVED.';
    });
  }

  function createLobby(gameId) {
    if (!gameSocket?.connected) {
      if (lobbyNoticeNode) lobbyNoticeNode.textContent = 'Reconnect before hosting an online room.';
      return;
    }
    gameSocket.emit('arcade:lobby:create', { gameId }, (result) => {
      if (result?.error) {
        if (lobbyNoticeNode) lobbyNoticeNode.textContent = result.error;
        return;
      }
      currentLobby = result.lobby;
      renderCurrentLobby();
      refreshLobbies();
    });
  }

  function joinLobby(id) {
    gameSocket?.emit('arcade:lobby:join', { id }, (result) => {
      if (result?.error) {
        if (lobbyNoticeNode) lobbyNoticeNode.textContent = result.error;
        refreshLobbies();
        return;
      }
      currentLobby = result.lobby;
      renderCurrentLobby();
    });
  }

  function leaveLobby() {
    gameSocket?.emit('arcade:lobby:leave', () => {
      currentLobby = null;
      renderCurrentLobby();
      refreshLobbies();
    });
  }

  function sendAdminAbility(ability) {
    gameSocket?.emit('arcade:admin-action', { lobbyId: currentLobby?.id, ability }, (result) => {
      if (result?.error && lobbyNoticeNode) lobbyNoticeNode.textContent = result.error;
    });
  }

  function recompileWorld() {
    gameSocket?.emit('arcade:owner-recompile', { lobbyId: currentLobby?.id }, (result) => {
      if (result?.error && lobbyNoticeNode) lobbyNoticeNode.textContent = result.error;
    });
  }

  function connectSocket() {
    if (!gameSocket) return;
    gameSocket.on('connect', refreshLobbies);
    gameSocket.on('arcade:lobbies:update', renderLobbyList);
    gameSocket.on('arcade:lobby:update', (lobby) => {
      currentLobby = { ...lobby, lastActivity: currentLobby?.lastActivity };
      renderCurrentLobby();
    });
    gameSocket.on('arcade:lobby:action', (event) => {
      if (!currentLobby || event.lobbyId !== currentLobby.id || !currentLobbyNode) return;
      currentLobby = { ...currentLobby, world: event.world, lastActivity: event.activity };
      renderCurrentLobby();
    });
    gameSocket.on('arcade:admin-effect', ({ ability, actor }) => {
      if (!currentLobbyNode) return;
      currentLobby.lastActivity = `${actor} used ${ability.toUpperCase()}.`;
      renderCurrentLobby();
    });
    gameSocket.on('arcade:world-recompiled', ({ revision, actor }) => {
      if (!currentLobbyNode || !currentLobby) return;
      currentLobby.worldRevision = revision;
      currentLobby.lastActivity = `${actor} recompiled the world. Timeline ${revision}.`;
      renderCurrentLobby();
    });
    gameSocket.on('disconnect', () => {
      currentLobby = null;
      renderCurrentLobby();
      if (lobbyNoticeNode) lobbyNoticeNode.textContent = 'CONNECTION LOST — RECONNECTING';
    });
  }

  window.addEventListener('app:viewchange', (event) => {
    if (event.detail?.view !== 'arcade') {
      stopMusic();
      if (activeGame) showMenu();
    } else {
      startMusic();
    }
  });

  function openGame(gameId) {
    cancelActiveGame();
    cancelActiveGame = () => {};
    activeGame = gameId;
    shell.replaceChildren();
    const game = games.find((item) => item.id === gameId);
    const header = make('div', 'arcade-game-header');
    header.append(make('div', '', `${game.mark} / ${game.genre}`), make('h2', '', game.name));
    const back = makeButton('← CABINET ROW', 'arcade-back', showMenu);
    const fullscreen = makeButton('FULLSCREEN', 'arcade-back', async () => {
      try {
        if (document.fullscreenElement === shell) await document.exitFullscreen();
        else await shell.requestFullscreen();
      } catch {
        fullscreen.textContent = 'FULLSCREEN UNAVAILABLE';
      }
    });
    fullscreen.dataset.arcadeFullscreen = 'true';
    header.append(fullscreen, back);
    const screen = make('div', 'arcade-screen');
    shell.append(header, screen);
    if (gameId === 'pulse-run') runPulse(screen);
    if (gameId === 'archive-walk') runArchive(screen);
    if (gameId === 'beat-relay') runRhythm(screen);
    if (gameId === 'drift-duel') runDuel(screen);
    if (gameId === 'echo-cabinet') runEchoScanner(screen);
    if (gameId === 'ashen-frontier') {
      cancelActiveGame = initializeFrontier(screen, {
        api: apiClient,
        socket: gameSocket,
        onCaptured: updateSavedProfile,
        collection: () => savedProfile.echoes || []
      });
    }
  }

  window.addEventListener('app:arcade-launch', (event) => {
    const gameId = event.detail?.gameId;
    if (games.some((game) => game.id === gameId)) openGame(gameId);
  });
  document.addEventListener('fullscreenchange', () => {
    const fullscreen = shell.querySelector('[data-arcade-fullscreen]');
    if (fullscreen) fullscreen.textContent = document.fullscreenElement === shell ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  });

  function runPulse(screen) {
    const canvas = make('canvas', 'pulse-canvas');
    canvas.width = 720;
    canvas.height = 360;
    canvas.setAttribute('aria-label', 'Pulse Run game arena. Move with arrow keys or WASD and avoid the red signals.');
    const context = canvas.getContext('2d');
    const help = make('p', 'arcade-help', 'MOVE: ARROWS / WASD  ·  MOBILE: DRAG  ·  AVOID THE RED SIGNALS');
    const status = make('div', 'arcade-status', 'READY WHEN YOU ARE');
    const start = makeButton('START RUN', 'arcade-button', begin);
    screen.append(canvas, help, status, start);
    const keys = new Set();
    let frame = 0;
    let animation = 0;
    let running = false;
    let last = 0;
    let elapsed = 0;
    let player = { x: 360, y: 180 };
    let hazards = [];

    function draw() {
      context.fillStyle = '#0a1018';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = 'rgba(86, 134, 168, .18)';
      for (let x = 0; x < canvas.width; x += 24) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
      }
      for (let y = 0; y < canvas.height; y += 24) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
      }
      context.fillStyle = '#f48072';
      for (const hazard of hazards) {
        context.beginPath(); context.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2); context.fill();
      }
      context.fillStyle = '#89f4cf';
      context.fillRect(player.x - 7, player.y - 7, 14, 14);
      context.strokeStyle = '#89f4cf';
      context.strokeRect(player.x - 11, player.y - 11, 22, 22);
    }

    function endRun(won) {
      running = false;
      cancelAnimationFrame(animation);
      status.textContent = won ? 'CLEAR SIGNAL — YOU HELD THE FIELD' : `SIGNAL LOST — ${Math.floor(elapsed)} SECONDS`;
      start.textContent = 'RUN AGAIN';
      start.disabled = false;
      draw();
      if (won) awardCompletion('fracture-run', status);
    }

    function tick(now) {
      if (!running) return;
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += delta;
      frame += delta;
      if (frame > 0.62) {
        frame = 0;
        const side = Math.floor(Math.random() * 4);
        const hazard = {
          x: side === 0 ? 0 : side === 1 ? canvas.width : Math.random() * canvas.width,
          y: side === 2 ? 0 : side === 3 ? canvas.height : Math.random() * canvas.height,
          vx: 0, vy: 0, r: 5 + Math.random() * 4
        };
        const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
        const speed = 75 + Math.random() * 55 + elapsed * 1.5;
        hazard.vx = Math.cos(angle) * speed;
        hazard.vy = Math.sin(angle) * speed;
        hazards.push(hazard);
      }
      const speed = 175;
      if (keys.has('arrowleft') || keys.has('a')) player.x -= speed * delta;
      if (keys.has('arrowright') || keys.has('d')) player.x += speed * delta;
      if (keys.has('arrowup') || keys.has('w')) player.y -= speed * delta;
      if (keys.has('arrowdown') || keys.has('s')) player.y += speed * delta;
      player.x = Math.max(12, Math.min(canvas.width - 12, player.x));
      player.y = Math.max(12, Math.min(canvas.height - 12, player.y));
      for (const hazard of hazards) { hazard.x += hazard.vx * delta; hazard.y += hazard.vy * delta; }
      hazards = hazards.filter((hazard) => hazard.x > -20 && hazard.x < canvas.width + 20 && hazard.y > -20 && hazard.y < canvas.height + 20);
      if (hazards.some((hazard) => Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.r + 6)) return endRun(false);
      status.textContent = `FIELD STABILITY  ${Math.max(0, 25 - elapsed).toFixed(1)} SEC`;
      draw();
      if (elapsed >= 25) return endRun(true);
      animation = requestAnimationFrame(tick);
    }

    function begin() {
      keys.clear();
      hazards = [];
      elapsed = 0;
      frame = 0;
      player = { x: 360, y: 180 };
      last = performance.now();
      running = true;
      start.disabled = true;
      status.textContent = 'SIGNAL LIVE';
      draw();
      animation = requestAnimationFrame(tick);
    }

    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
      keys.add(key);
    };
    const onKeyUp = (event) => keys.delete(event.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointermove', (event) => {
      if (!running || event.pointerType === 'mouse' && event.buttons === 0) return;
      const bounds = canvas.getBoundingClientRect();
      player.x = (event.clientX - bounds.left) * canvas.width / bounds.width;
      player.y = (event.clientY - bounds.top) * canvas.height / bounds.height;
    });
    canvas.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'mouse') canvas.setPointerCapture(event.pointerId); });
    draw();
    cancelActiveGame = () => {
      running = false;
      cancelAnimationFrame(animation);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }

  function runArchive(screen) {
    const map = [
      '##########',
      '#..#.....#',
      '#..#.#...#',
      '#....#.#.#',
      '###..#...#',
      '#...##...#',
      '#........#',
      '##########'
    ];
    const board = make('div', 'archive-board');
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', 'Archive Walk map');
    const status = make('p', 'arcade-status', 'Find three motes, then reach the exit marked X.');
    const controls = make('div', 'archive-controls');
    const position = { x: 1, y: 1 };
    const motes = new Set(['7,1', '2,5', '7,6']);
    let found = 0;
    let complete = false;

    function update(dx, dy) {
      if (complete) return;
      const x = position.x + dx;
      const y = position.y + dy;
      if (!map[y] || map[y][x] === '#') return;
      position.x = x;
      position.y = y;
      const key = `${x},${y}`;
      if (motes.delete(key)) found += 1;
      if (x === 8 && y === 6 && found === 3) complete = true;
      render();
      if (complete) awardCompletion('archive-walk', status);
    }

    function render() {
      board.replaceChildren();
      map.forEach((row, y) => [...row].forEach((tile, x) => {
        const key = `${x},${y}`;
        const cell = make('div', `archive-cell ${tile === '#' ? 'wall' : 'floor'}`);
        cell.setAttribute('role', 'gridcell');
        if (position.x === x && position.y === y) {
          cell.classList.add('player');
          cell.textContent = '@';
          cell.setAttribute('aria-label', 'You');
        } else if (x === 8 && y === 6) {
          cell.classList.add('exit');
          cell.textContent = 'X';
          cell.setAttribute('aria-label', 'Exit');
        } else if (motes.has(key)) {
          cell.classList.add('mote');
          cell.textContent = '*';
          cell.setAttribute('aria-label', 'Data mote');
        } else {
          cell.textContent = tile === '#' ? ' ' : '·';
          cell.setAttribute('aria-label', tile === '#' ? 'Wall' : 'Floor');
        }
        board.append(cell);
      }));
      status.textContent = complete ? 'ARCHIVE RESTORED — NICE WORK.' : `DATA MOTES ${found}/3  ·  ${found === 3 ? 'EXIT UNLOCKED' : 'EXIT SEALED'}`;
    }

    function onKeyDown(event) {
      const directions = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] };
      const direction = directions[event.key] || directions[event.key.toLowerCase()];
      if (!direction || activeGame !== 'archive-walk') return;
      event.preventDefault();
      update(...direction);
    }
    window.addEventListener('keydown', onKeyDown);
    const directions = [['↑', 0, -1], ['←', -1, 0], ['↓', 0, 1], ['→', 1, 0]];
    for (const [label, dx, dy] of directions) controls.append(makeButton(label, 'arcade-button archive-step', () => update(dx, dy)));
    screen.append(board, status, make('p', 'arcade-help', 'MOVE: ARROWS / WASD OR THE DIRECTION KEYS'), controls);
    render();
    cancelActiveGame = () => window.removeEventListener('keydown', onKeyDown);
  }

  function runRhythm(screen) {
    const state = { phrase: [], input: [], round: 1, score: 0, accepting: false };
    const phraseNode = make('div', 'rhythm-phrase');
    const inputNode = make('div', 'rhythm-input');
    const status = make('p', 'arcade-status', 'Listen to the pattern, then repeat it.');
    const pads = make('div', 'rhythm-pads');
    let responseTimer;
    const play = makeButton('PLAY PHRASE', 'arcade-button', () => {
      if (!state.accepting) nextPhrase();
    });

    function paintPhrase() {
      phraseNode.replaceChildren();
      state.phrase.forEach((tone) => phraseNode.append(make('span', `rhythm-note tone-${tone}`, toneGlyphs[tone])));
    }
    function nextPhrase() {
      state.phrase = Array.from({ length: 4 }, () => Math.floor(Math.random() * 3));
      state.input = [];
      state.accepting = false;
      paintPhrase();
      inputNode.textContent = 'YOUR REPLY: —';
      status.textContent = `PHRASE ${state.round}  ·  LISTEN, THEN REPEAT`;
      play.disabled = true;
      responseTimer = window.setTimeout(() => {
        state.accepting = true;
        status.textContent = `PHRASE ${state.round}  ·  YOUR TURN`;
        play.disabled = false;
      }, 450);
    }
    function hit(tone) {
      if (!state.accepting) return;
      state.input.push(tone);
      inputNode.textContent = `YOUR REPLY: ${state.input.map((item) => toneGlyphs[item]).join(' ')}`;
      if (state.input.length < state.phrase.length) return;
      state.accepting = false;
      const correct = state.input.every((item, index) => item === state.phrase[index]);
      if (correct) {
        state.score += 100 * state.round;
        status.textContent = `CLEAN REPLY  ·  SCORE ${state.score}`;
        awardCompletion('beat-relay', status);
        state.round += 1;
      } else {
        status.textContent = `STATIC! PATTERN MISSED  ·  SCORE ${state.score}`;
      }
      play.textContent = correct ? 'NEXT PHRASE' : 'TRY AGAIN';
      play.disabled = false;
    }
    toneNames.forEach((name, tone) => {
      const button = makeButton(`${toneGlyphs[tone]} ${name}`, `arcade-button tone-button tone-${tone}`, () => hit(tone));
      pads.append(button);
    });
    screen.append(make('p', 'arcade-help', 'MEMORIZE THE FOUR-NOTE SIGNAL, THEN REPLY'), phraseNode, inputNode, pads, status, play);
    cancelActiveGame = () => window.clearTimeout(responseTimer);
    nextPhrase();
  }

  function runDuel(screen) {
    const foes = [
      { name: 'Gatehouse Unit', hp: 34, intent: 'CHARGE' },
      { name: 'Soft-Reset Warden', hp: 42, intent: 'STATIC BURST' },
      { name: 'The Last Meter', hp: 52, intent: 'OVERLOAD' }
    ];
    const state = { index: 0, hp: 48, foeHp: foes[0].hp, guard: false, done: false, phase: 'battle', log: 'A seam opens between two unfamiliar skies. A gatekeeper steps through.' };
    const screenBody = make('div', 'duel-layout');
    const status = make('div', 'duel-status');
    const log = make('p', 'arcade-status');
    const actions = make('div', 'duel-actions');

    function render() {
      const foe = foes[state.index];
      status.replaceChildren();
      const character = gameUser.role === 'Owner' ? 'PRIME ARCHITECT' : gameUser.isAdmin ? 'RIFT WARDEN' : 'FIELD PILOT';
      status.append(make('div', 'duel-card', `${character}  ·  ${state.hp}/48 HP`));
      status.append(make('div', 'duel-card', state.done ? 'RING CLEAR' : `${foe.name}  ${state.foeHp}/${foe.hp} HP`));
      status.append(make('div', 'duel-card', `SAVED STORY  ·  CHAPTER ${savedProfile.storyChapter}`));
      log.textContent = state.log;
      actions.replaceChildren();
      if (state.done) {
        actions.append(makeButton('RUN IT BACK', 'arcade-button', () => {
          state.index = 0; state.hp = 48; state.foeHp = foes[0].hp; state.done = false; state.phase = 'battle'; state.log = 'A seam opens between two unfamiliar skies. A gatekeeper steps through.'; render();
        }));
        return;
      }
      if (state.phase === 'interlude') {
        actions.append(make('p', 'arcade-help', 'THE REALM SPLITS. CHOOSE HOW TO CROSS:'));
        actions.append(makeButton('LISTEN TO THE SEAM', 'arcade-button', () => chooseRoute('listen')));
        actions.append(makeButton('HOLD THE LINE', 'arcade-button', () => chooseRoute('hold')));
        actions.append(makeButton('CROSS THE BRIGHT EDGE', 'arcade-button', () => chooseRoute('cross')));
        return;
      }
      actions.append(makeButton('PULSE  /  STRIKE', 'arcade-button', () => act('pulse')));
      actions.append(makeButton('BRACE  /  GUARD', 'arcade-button', () => act('brace')));
      actions.append(makeButton('TUNE  /  RECOVER', 'arcade-button', () => act('tune')));
      if (gameUser.isAdmin) actions.append(makeButton('WARDEN VERDICT  /  END ENCOUNTER', 'arcade-button', () => act('warden')));
      if (gameUser.role === 'Owner') {
        actions.append(makeButton('WORLD RECOMPILE  /  RESET ROUTE', 'arcade-button', () => {
          state.index = 0; state.hp = 48; state.foeHp = foes[0].hp; state.done = false; state.phase = 'battle'; state.guard = false;
          state.log = 'The route is recompiled. The first seam appears again.';
          render();
        }));
      }
    }

    function chooseRoute(route) {
      state.phase = 'battle';
      if (route === 'listen') {
        state.hp = Math.min(48, state.hp + 10);
        state.log = 'You hear the next realm before entering it. Recover 10 HP.';
      } else if (route === 'hold') {
        state.guard = true;
        state.log = 'You brace at the threshold. Your next hit is softened.';
      } else {
        state.foeHp = Math.max(1, state.foeHp - 8);
        state.log = 'You take the narrow passage and catch the next gatekeeper off-balance.';
      }
      render();
      saveStoryChoice(route, log);
    }

    function act(action) {
      if (state.phase !== 'battle' || state.done) return;
      const foe = foes[state.index];
      let note = '';
      if (action === 'pulse') {
        const damage = 8 + Math.floor(Math.random() * 8);
        state.foeHp -= damage;
        note = `Your pulse lands for ${damage}.`;
      } else if (action === 'brace') {
        state.guard = true;
        note = 'You set a steady guard.';
      } else if (action === 'warden') {
        state.foeHp = 0;
        note = 'The Rift Warden overrides the encounter.';
      } else {
        const healing = 7;
        state.hp = Math.min(48, state.hp + healing);
        note = `You tune the noise away (+${healing} HP).`;
      }
      if (state.foeHp <= 0) {
        note += ` ${foe.name} powers down.`;
        state.index += 1;
        if (state.index === foes.length) {
          state.done = true;
          awardCompletion('fracture-run', log);
        } else {
          state.foeHp = foes[state.index].hp;
          state.phase = 'interlude';
          note += ' The next seam opens onto another stitched realm.';
        }
        state.log = note;
        render();
        return;
      }
      const damage = foe.intent === 'OVERLOAD' ? 12 : foe.intent === 'STATIC BURST' ? 9 : 7;
      const taken = state.guard ? Math.ceil(damage / 3) : damage;
      state.hp -= taken;
      state.guard = false;
      note += ` ${foe.name} uses ${foe.intent.toLowerCase()} (-${taken} HP).`;
      if (state.hp <= 0) {
        state.hp = 0;
        state.done = true;
        note += ' The ring goes quiet. Try another approach.';
      }
      state.log = note;
      render();
    }
    screenBody.append(status, log, actions);
    screen.append(screenBody);
    render();
  }

  function readCollection() {
    if (apiClient) {
      return (savedProfile.echoes || []).map((id) => echoSpecies.find((echo) => echo.id === id)?.name).filter(Boolean);
    }
    try {
      const saved = JSON.parse(localStorage.getItem('antiNullEchoCollection') || '[]');
      return Array.isArray(saved) ? saved.filter((name) => echoSpecies.some((echo) => echo.name === name)) : [];
    } catch (error) {
      console.warn('Could not read the Resonance Grove catalog.', error);
      return [];
    }
  }

  function renderCollection(target) {
    target.replaceChildren();
    const collection = readCollection();
    if (!collection.length) {
      target.append(make('span', 'echo-empty', 'NO ECHOES CATALOGED'));
      return;
    }
    for (const name of collection) {
      const echo = echoSpecies.find((item) => item.name === name);
      if (echo) target.append(make('span', 'echo-entry', `${echo.glyph} ${echo.name} / ${echo.type}`));
    }
  }

  function runEchoScanner(screen) {
    let collection = readCollection();
    let current = null;
    let challengeId = null;
    let input = [];
    let revealTimer;
    const display = make('div', 'echo-display', '⌁');
    const tones = make('div', 'echo-tones');
    const status = make('p', 'arcade-status', 'Scan the band to find a signal-being.');
    const catalog = make('div', 'echo-collection');
    const scan = makeButton('SCAN BAND', 'arcade-button', startScan);
    const pads = make('div', 'rhythm-pads');
    const labels = ['○ LOW', '◇ MID', '△ HIGH'];
    const trial = make('section', 'echo-trial');
    let selectedEchoId = '';
    let trialState = null;

    function renderCollected() {
      collection = readCollection();
      catalog.replaceChildren();
      if (!collection.length) catalog.append(make('span', 'echo-empty', 'NO ECHOES CATALOGED'));
      for (const name of collection) {
        const echo = echoSpecies.find((item) => item.name === name);
        if (echo) catalog.append(make('span', 'echo-entry', `${echo.glyph} ${echo.name} / ${echo.type}`));
      }
      const available = echoSpecies.filter((echo) => collection.includes(echo.name));
      if (!available.some((echo) => echo.id === selectedEchoId)) selectedEchoId = available[0]?.id || '';
      renderTrial();
    }

    function renderTrial() {
      trial.replaceChildren(make('h3', 'arcade-eyebrow', 'ECHO TRIAL / COMPANION COMBAT'));
      trial.append(make('p', 'arcade-help', 'Affinity cycle: HUSH > GLOW > METAL > TIDE > DUSK > WIND > EMBER > MOSS > PRISM > BRINE > STORM > SHADE > HUSH. Edges deal 1.5×; resisted attacks deal 0.65×.'));
      if (!selectedEchoId) {
        trial.append(make('p', 'arcade-help', 'Catalog a signal-being to unlock the trial. Your companions and their signature skills will be available here.'));
        return;
      }

      const roster = echoSpecies.filter((echo) => collection.includes(echo.name));
      const selection = make('label', 'echo-trial-select');
      selection.append(make('span', '', 'ACTIVE COMPANION'));
      const selector = make('select', 'echo-trial-roster');
      for (const echo of roster) {
        const option = make('option', '', `${echo.glyph} ${echo.name} / ${echo.type}`);
        option.value = echo.id;
        option.selected = echo.id === selectedEchoId;
        selector.append(option);
      }
      selector.addEventListener('change', () => {
        selectedEchoId = selector.value;
        trialState = null;
        renderTrial();
      });
      selection.append(selector);
      trial.append(selection);

      const echo = echoSpecies.find((item) => item.id === selectedEchoId);
      trial.append(make('p', 'arcade-help', `${echo.glyph} ${echo.name} / ${echo.type}  ·  ${echo.skill}: ${echo.effect}`));
      const arena = make('div', 'echo-trial-arena');
      if (!trialState) {
        arena.append(make('p', 'arcade-status', 'Three encounters stand between your companion and the end of the trial.'));
        arena.append(makeButton('BEGIN ECHO TRIAL', 'arcade-button', () => {
          trialState = { index: 0, hp: 36, sparks: 2, enemyHp: trialFoes[0].hp, guardNext: false, done: false, won: false };
          renderTrial();
        }));
        trial.append(arena);
        return;
      }

      const foe = trialFoes[trialState.index];
      const teamStatus = make('div', 'echo-trial-status');
      teamStatus.append(make('p', 'arcade-status', `${echo.glyph} ${echo.name} / ${trialState.hp}/36 HP  ·  ${trialState.sparks}/3 SPARKS`));
      teamStatus.append(make('p', 'arcade-status', trialState.won ? 'TRIAL COMPLETE' : `${foe.glyph} ${foe.name} / ${trialState.enemyHp}/${foe.hp} HP  ·  ${foe.type}`));
      arena.append(teamStatus);
      const log = make('p', 'arcade-help', trialState.message || (trialState.won ? 'Your companion holds the line. The grove remembers.' : `${foe.name} telegraphs ${foe.intent.toLowerCase()} / ${foe.damage} damage.`));
      arena.append(log);

      if (trialState.done) {
        arena.append(makeButton(trialState.won ? 'RUN TRIAL AGAIN' : 'RETRY TRIAL', 'arcade-button', () => {
          trialState = { index: 0, hp: 36, sparks: 2, enemyHp: trialFoes[0].hp, guardNext: false, done: false, won: false };
          renderTrial();
        }));
      } else {
        const actions = make('div', 'duel-actions');
        actions.append(makeButton('PULSE / +1 SPARK', 'arcade-button', () => trialAction('pulse')));
        const skill = makeButton(`${echo.skill.toUpperCase()} / 2 SPARKS`, 'arcade-button', () => trialAction('skill'));
        skill.disabled = trialState.sparks < 2;
        actions.append(skill);
        actions.append(makeButton('GUARD / SOAK NEXT HIT', 'arcade-button', () => trialAction('guard')));
        actions.append(makeButton('TUNE / RESTORE 7 HP', 'arcade-button', () => trialAction('tune')));
        arena.append(actions);
      }
      trial.append(arena);
    }

    const trialFoes = [
      { name: 'Prism Mite', glyph: '✧', type: 'GLOW', hp: 28, intent: 'FLASH', damage: 6 },
      { name: 'Silt Herald', glyph: '⌇', type: 'TIDE', hp: 36, intent: 'UNDERTOW', damage: 8 },
      { name: 'Quiet Buoy', glyph: '◉', type: 'DUSK', hp: 44, intent: 'DEEP HUM', damage: 10 }
    ];

    function typeMultiplier(attackerType, defenderType) {
      if (affinityAdvantages[attackerType] === defenderType) return 1.5;
      if (affinityAdvantages[defenderType] === attackerType) return 0.65;
      return 1;
    }

    function trialAction(action) {
      if (!trialState || trialState.done) return;
      const echo = echoSpecies.find((item) => item.id === selectedEchoId);
      const foe = trialFoes[trialState.index];
      let damage = 0;
      let message = '';
      if (action === 'pulse') {
        damage = 8;
        trialState.sparks = Math.min(3, trialState.sparks + 1);
        message = `${echo.name} sends a steady pulse.`;
      } else if (action === 'skill' && trialState.sparks >= 2) {
        damage = echo.power;
        trialState.sparks -= 2;
        message = `${echo.name} uses ${echo.skill}.`;
        if (echo.id === 'rain-circuit') trialState.hp = Math.min(36, trialState.hp + 5);
        if (echo.id === 'tin-lullaby') trialState.sparks = Math.min(3, trialState.sparks + 1);
        if (echo.id === 'velvet-static' || echo.id === 'morrow-hum' || echo.id === 'paper-comet') trialState.guardNext = true;
      } else if (action === 'guard') {
        trialState.guardNext = true;
        message = `${echo.name} holds a protective note.`;
      } else if (action === 'tune') {
        trialState.hp = Math.min(36, trialState.hp + 7);
        message = `${echo.name} tunes the static away.`;
      } else {
        return;
      }

      if (damage) {
        const multiplier = typeMultiplier(echo.type, foe.type);
        const dealt = Math.max(1, Math.round(damage * multiplier));
        trialState.enemyHp -= dealt;
        if (multiplier > 1) message += ` Affinity edge! ${dealt} damage.`;
        else if (multiplier < 1) message += ` The foe resists; ${dealt} damage.`;
        else message += ` ${dealt} damage.`;
      }

      if (trialState.enemyHp <= 0) {
        message += ` ${foe.name} leaves the ring.`;
        trialState.index += 1;
        if (trialState.index === trialFoes.length) {
          trialState.done = true;
          trialState.won = true;
          trialState.message = `${message} The full trial is complete.`;
          renderTrial();
          awardCompletion('echo-cabinet', status);
          return;
        }
        trialState.enemyHp = trialFoes[trialState.index].hp;
        trialState.message = `${message} A new signal enters the ring.`;
        renderTrial();
        return;
      }

      const incoming = foe.damage;
      const taken = trialState.guardNext ? Math.ceil(incoming / 3) : incoming;
      trialState.hp = Math.max(0, trialState.hp - taken);
      trialState.guardNext = false;
      message += ` ${foe.name} uses ${foe.intent.toLowerCase()} (-${taken} HP).`;
      if (trialState.hp === 0) {
        trialState.done = true;
        message += ' The trial goes quiet. Regroup and try another companion.';
      }
      trialState.message = message;
      renderTrial();
    }

    function startScan() {
      const available = echoSpecies.filter((echo) => !collection.includes(echo.name));
      if (!available.length) {
        current = null;
        display.textContent = '✦';
        tones.textContent = 'Every known signal-being has found a place in your catalog.';
        status.textContent = 'FIELD NOTES COMPLETE';
        scan.textContent = 'ALL SIGNALS FOUND';
        scan.disabled = true;
        return;
      }
      scan.disabled = true;
      prepareScan(available);
    }

    async function prepareScan(available) {
      try {
        if (apiClient) {
          const result = await apiClient('/api/games/echoes/challenge', { method: 'POST' });
          challengeId = result.challengeId;
          current = { ...echoSpecies.find((echo) => echo.id === result.echo.id), ...result.echo, tones: result.trace };
        } else {
          current = available[Math.floor(Math.random() * available.length)];
        }
      } catch (error) {
        status.textContent = `SCAN FAILED: ${error.message}`;
        scan.disabled = false;
        return;
      }
      input = [];
      display.textContent = current.glyph;
      tones.textContent = current.tones.map((tone) => toneGlyphs[tone]).join('  ');
      status.textContent = `${current.note || `${current.type} resonance`} Match its three-note trace.`;
      pads.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => {
        if (!current) return;
        tones.textContent = 'TRACE SEALED — REPEAT THE THREE NOTES';
        pads.querySelectorAll('button').forEach((button) => { button.disabled = false; });
      }, 1800);
    }

    async function tune(tone) {
      if (!current) return;
      input.push(tone);
      if (input.length < current.tones.length) {
        status.textContent = `TRACE ${input.length}/3  ·  LISTEN TO THE ECHO`;
        return;
      }
      const matched = input.every((item, index) => item === current.tones[index]);
      if (matched) {
        const foundEcho = current;
        current = null;
        pads.querySelectorAll('button').forEach((button) => { button.disabled = true; });
        if (apiClient) {
          try {
            const result = await apiClient('/api/games/echoes/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ challengeId, trace: input })
            });
            updateSavedProfile(result.profile);
            collection = readCollection();
          } catch (error) {
            status.textContent = `CATALOG SAVE FAILED: ${error.message}`;
            scan.disabled = false;
            scan.textContent = 'SCAN AGAIN';
            return;
          }
        } else {
          collection.push(foundEcho.name);
          let localSaveError;
          try {
            localStorage.setItem('antiNullEchoCollection', JSON.stringify(collection));
          } catch (error) {
            console.warn('Could not save the Resonance Grove catalog.', error);
            localSaveError = error;
          }
          if (localSaveError) status.textContent = `CATALOG SAVE FAILED: ${localSaveError.message}`;
        }
        display.textContent = foundEcho.glyph;
        if (apiClient || !status.textContent.startsWith('CATALOG SAVE FAILED:')) {
          status.textContent = `${foundEcho.name.toUpperCase()} / ${foundEcho.type || 'ECHO'} ADDED TO THE FIELD CATALOG.`;
        }
        renderCollected();
        scan.disabled = false;
        scan.textContent = 'SCAN AGAIN';
      } else {
        status.textContent = 'THE TRACE SLIPPED AWAY. SCAN AND TRY ANOTHER BAND.';
        current = null;
        scan.disabled = false;
        scan.textContent = 'SCAN AGAIN';
      }
      pads.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    }

    labels.forEach((label, tone) => pads.append(makeButton(label, `arcade-button tone-button tone-${tone}`, () => tune(tone))));
    screen.append(display, make('p', 'arcade-help', 'READ THE THREE-TONE TRACE. REPEAT IT TO CATALOG THE SIGNAL-BEING.'), tones, pads, status, scan, make('h3', 'arcade-eyebrow', 'FIELD CATALOG'), catalog, trial);
    renderCollected();
    startScan();
    cancelActiveGame = () => window.clearTimeout(revealTimer);
  }

  connectSocket();
  showMenu();
  if (apiClient) {
    apiClient('/api/games/profile')
      .then(({ profile }) => {
        updateSavedProfile(profile);
        renderCollection(menuCollectionNode);
      })
      .catch((error) => {
        if (lobbyNoticeNode) lobbyNoticeNode.textContent = `SAVED PROGRESS UNAVAILABLE: ${error.message}`;
      });
  }
}
