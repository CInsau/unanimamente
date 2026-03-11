let invitedRoomId = null;
const socket = io();
let myRoomId = '';
let isHost = false;
let gameTimer;
let players_local_cache = {};

// Al cargar la página, comprobar si hay una sala en la URL
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    invitedRoomId = urlParams.get('room');

    const guestSection = document.getElementById('guest-join-section');
    const standardSection = document.getElementById('standard-home-section');

    if (invitedRoomId) {
        // Caso: Viene por enlace de invitación
        standardSection.style.display = 'none';
        guestSection.style.display = 'block';
        document.getElementById('invited-room-id').innerText = invitedRoomId;
    } else {
        // Caso: Entrada normal a la web
        standardSection.style.display = 'block';
        guestSection.style.display = 'none';
    }
    
    // Aseguramos que la pantalla home sea la visible al cargar
    showScreen('screen-home');
};

function normalizeText(text) {
    return text.toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // Quita tildes y diéresis
}

// Función para el invitado que entra por enlace
function joinInvitedRoom() {
    const name = document.getElementById('playerNameGuest').value.trim();
    if (name && invitedRoomId) {
        socket.emit('joinRoom', invitedRoomId, name);
    } else {
        alert("Por favor, introduce tu nombre.");
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function createRoom() {
    const name = document.getElementById('playerName').value;
    if (!name) return alert("Pon tu nombre");
    myRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { roomId: myRoomId, playerName: name });
}

function joinRoom() {
    const name = document.getElementById('playerName').value;
    myRoomId = document.getElementById('joinRoomId').value.toUpperCase();
    if (!name || !myRoomId) return alert("Falta nombre o sala");
    socket.emit('joinRoom', { roomId: myRoomId, playerName: name });
}

socket.on('roomJoined', (data) => {
    myRoomId = data.roomId;
    isHost = (socket.id === data.hostId);
    showScreen('screen-lobby');
    document.getElementById('displayRoomId').innerText = myRoomId;

    if (isHost) {
        document.getElementById('hostControls').style.display = 'block';
        // Generar enlace compartido
        const shareContainer = document.getElementById('share-container');
        const shareInput = document.getElementById('share-link');
        const fullLink = `${window.location.origin}${window.location.pathname}?room=${myRoomId}`;
        
        shareInput.value = fullLink;
        shareContainer.style.display = 'block';
    }
});

// Función para copiar el enlace al portapapeles
function copyLink() {
    const copyText = document.getElementById("share-link");
    copyText.select();
    copyText.setSelectionRange(0, 99999); // Para móviles
    navigator.clipboard.writeText(copyText.value);
    alert("¡Enlace copiado! Pásalo por el chat de Teams.");
}

socket.on('updatePlayers', (players) => {
	players_local_cache = players;
    const list = document.getElementById('playerList');
    list.innerHTML = '';
    for (let id in players) {
        const isReady = players[id].ready ? ' ✅' : '';
        list.innerHTML += `<li id="player-${id}">${players[id].name}${isReady}</li>`;
    }
});

socket.on('playerReady', (playerId) => {
    const el = document.getElementById(`player-${playerId}`);
    if (el && !el.innerText.includes('✅')) {
        el.innerText += ' ✅';
        el.style.color = '#28a745';
        el.style.fontWeight = 'bold';
    }
});

function startGame() {
    const rounds = document.getElementById('configRounds').value;
    const time = document.getElementById('configTime').value;
    socket.emit('startGame', myRoomId, { rounds, time });
}

socket.on('roundStarted', (data) => {
    // Ocultar votación y mostrar juego
    document.getElementById('theme-voting-section').style.display = 'none';
    document.getElementById('game-play-section').style.display = 'block';
    
    document.getElementById('themeDisplay').innerText = data.theme;
    document.getElementById('btnSubmit').disabled = false;
    document.getElementById('btnSubmit').innerText = "Hecho";
    
    // Generar 8 casillas
    const inputsDiv = document.getElementById('wordInputs');
    inputsDiv.innerHTML = '';
    for(let i=1; i<=8; i++){
        inputsDiv.innerHTML += `<input type="text" id="word${i}" placeholder="Palabra ${i}">`;
    }
    
    let time = data.time;
    document.getElementById('timeRemaining').innerText = time;
    showScreen('screen-game');
    
    clearInterval(gameTimer);
    gameTimer = setInterval(() => {
        time--;
        document.getElementById('timeRemaining').innerText = time;
        if (time <= 0) {
            clearInterval(gameTimer);
            submitWords();
        }
    }, 1000);
	
	document.getElementById('round-ready-count').innerText = `0 / ${data.totalPlayers}`;
});

function submitWords() {
    const btn = document.getElementById('btnSubmit');
    if (btn.disabled) return; // Evitar doble clic

    btn.disabled = true;
    btn.innerText = "¡Enviado!";

    // Bloquear todos los inputs de palabras
    for(let i=1; i<=8; i++){
        const input = document.getElementById(`word${i}`);
        input.disabled = true;
        input.style.backgroundColor = "#e9ecef"; // Color de campo bloqueado
    }

    let words = [];
    for(let i=1; i<=8; i++){
        words.push(document.getElementById(`word${i}`).value);
    }
    socket.emit('submitWords', myRoomId, words);
}

socket.on('playerReady', (playerId) => {
    const playerElements = document.querySelectorAll('#playerList li');
    // Como el playerList se genera por nombre, buscamos el elemento que coincida
    // Para hacerlo más preciso, vamos a retocar un poco la función updatePlayers
});

// ACTUALIZADO: Mostrar resultados y preparar la interfaz
socket.on('showResults', (wordCounts) => {
    // Guardamos localmente las palabras para el desplegable del Host
    window.currentRoundWords = Object.keys(wordCounts).sort(); 
    renderResults(wordCounts);
    showScreen('screen-results');
    if (isHost) document.getElementById('hostResultsControls').style.display = 'block';
});

// NUEVO EVENTO: Actualización en tiempo real de la lista tras una fusión del host
socket.on('updateResultsList', (wordCounts) => {
    // Actualizamos la lista de palabras disponibles para el desplegable
    window.currentRoundWords = Object.keys(wordCounts).sort();
    renderResults(wordCounts);
});

// ACTUALIZADO: Renderizar la lista (Cambio importante en la interfaz del Host)
function renderResults(wordCounts) {
    const list = document.getElementById('resultsList');
    list.innerHTML = '';
    
    // Ordenar palabras por frecuencia (más repetidas arriba)
    const sortedWords = Object.keys(wordCounts).sort((a, b) => wordCounts[b].count - wordCounts[a].count);
    
    sortedWords.forEach(word => {
        let li = document.createElement('li');
        li.className = 'result-item'; // Para estilos CSS

        // Parte 1: Info de la palabra y conteo
        let infoSpan = document.createElement('span');
        infoSpan.innerHTML = `<strong>${word}</strong> (${wordCounts[word].count})`;
        li.appendChild(infoSpan);

        // Parte 2: Controles de fusión (SOLO PARA EL HOST)
        if (isHost) {
            let controlsDiv = document.createElement('div');
            controlsDiv.className = 'host-merge-controls';

            // Crear el desplegable (Select)
            let select = document.createElement('select');
            select.id = `merge-select-${word}`; // ID único para esta palabra
            
            // Opción por defecto
            let defaultOpt = document.createElement('option');
            defaultOpt.text = "Unir a...";
            defaultOpt.value = "";
            select.add(defaultOpt);

            // Añadir todas las OTRAS palabras como opciones
            window.currentRoundWords.forEach(otherWord => {
                if (otherWord !== word) {
                    let option = document.createElement('option');
                    option.value = otherWord;
                    option.text = otherWord;
                    select.add(option);
                }
            });

            // Botón para confirmar la fusión
            let mergeBtn = document.createElement('button');
            mergeBtn.innerText = "OK";
            mergeBtn.className = "btn-mini-merge";
            mergeBtn.onclick = () => {
                const targetWord = document.getElementById(`merge-select-${word}`).value;
                if (targetWord) {
                    // Confirmación verbal por Teams (implícita), confirmación visual aquí
                    if(confirm(`¿Fusionar "${word}" DENTRO de "${targetWord}"?`)) {
                        socket.emit('forceMerge', myRoomId, word, targetWord);
                    }
                }
            };

            controlsDiv.appendChild(select);
            controlsDiv.appendChild(mergeBtn);
            li.appendChild(controlsDiv);
        }

        list.appendChild(li);
    });
}

function requestMerge(oldWord) {
    const newWord = prompt(`¿A qué palabra quieres unir "${oldWord}"? Escríbela exactamente igual:`);
    if (newWord && newWord !== oldWord) {
        socket.emit('proposeMerge', myRoomId, oldWord, newWord);
    }
}

socket.on('startVote', (data) => {
    document.getElementById('votingQuestion').innerText = `${data.proposer} propone unir "${data.oldWord}" con "${data.newWord}". ¿Todos de acuerdo?`;
    document.getElementById('votingModal').style.display = 'block';
});

function castVote(isYes) {
    document.getElementById('votingModal').style.display = 'none';
    socket.emit('castVote', myRoomId, isYes);
}

socket.on('voteEnded', (data) => {
    if (data.success) {
        alert("¡Votación unánime! Palabras unidas.");
        renderResults(data.wordCounts);
    } else {
        alert("Alguien votó en contra. La unión se cancela.");
    }
});

function goToNextRound() {
    socket.emit('nextRound', myRoomId);
}

socket.on('showScores', (data) => {
    renderScoresList(data); // Tu función que pinta la lista de puntos
    showScreen('screen-scores');

    if (isHost) {
        // Si no es la última ronda, mostramos el botón de "Siguiente"
        if (!data.isLastRound) {
            document.getElementById('hostScoreControls').style.display = 'block';
            document.getElementById('hostFinalControls').style.display = 'none';
        } else {
            // Si es la última, ocultamos el de "Siguiente" y mostramos "Nueva Partida"
            document.getElementById('hostScoreControls').style.display = 'none';
            document.getElementById('hostFinalControls').style.display = 'block';
        }
    } else {
        document.getElementById('waitNextRoundMsg').style.display = 'block';
    }
});

function proceedToNext() {
    socket.emit('proceedToNextRound', myRoomId);
    // Ocultamos el botón para evitar múltiples clics
    document.getElementById('hostScoreControls').style.display = 'none';
}

socket.on('gameOver', (data) => {
    alert("¡Juego terminado!");
    // Aquí podrías añadir un botón de "Volver a jugar" que recargue la página.
});

// 1. Al final del evento 'showScores' o 'gameOver', mostramos el botón al host
socket.on('gameOver', (data) => {
    // Reutilizamos la lógica de mostrar puntuaciones
    renderFinalScores(data); 
    if (isHost) {
        document.getElementById('hostFinalControls').style.display = 'block';
    } else {
        document.getElementById('waitHostResart').style.display = 'block';
    }
});

function renderFinalScores(data) {
    const list = document.getElementById('scoresList');
    list.innerHTML = '<h3>¡Ranking Final!</h3>';
    // Ordenar jugadores por puntuación total
    const sortedIds = Object.keys(data.totalScores).sort((a, b) => data.totalScores[b] - data.totalScores[a]);
    
    sortedIds.forEach(id => {
        list.innerHTML += `<li><strong>${data.players[id].name}</strong>: ${data.totalScores[id]} puntos</li>`;
    });
    showScreen('screen-scores');
}

// 2. Función que llama el Host al pulsar el botón
function resetGame() {
    socket.emit('resetRoom', myRoomId);
}

// 3. Evento que reciben todos cuando el Host resetea
socket.on('roomReseted', () => {
    // Ocultar controles de final de partida
    document.getElementById('hostFinalControls').style.display = 'none';
    document.getElementById('waitHostResart').style.display = 'none';
	document.getElementById('hostScoreControls').style.display = 'none';
    document.getElementById('waitNextRoundMsg').style.display = 'none';
    
    // Volver al lobby
    showScreen('screen-lobby');
    alert("El anfitrión ha reiniciado la sala. ¡Listos para otra!");
});

socket.on('startThemeVote', (data) => {
    showScreen('screen-game');
    document.getElementById('theme-voting-section').style.display = 'block';
    document.getElementById('game-play-section').style.display = 'none';
    document.getElementById('wait-vote-msg').style.display = 'none';
    
    // Poner los nombres de los temas en los botones
    document.getElementById('theme-opt-0').innerText = data.options[0];
    document.getElementById('theme-opt-1').innerText = data.options[1];
    document.getElementById('theme-opt-0').disabled = false;
    document.getElementById('theme-opt-1').disabled = false;
	
	// Actualizar el contador con el total que envía el server
    document.getElementById('theme-vote-count').innerText = `0 / ${data.total_players_info}`;
});

function voteTheme(index) {
    socket.emit('castThemeVote', myRoomId, index);
    document.getElementById('theme-opt-0').disabled = true;
    document.getElementById('theme-opt-1').disabled = true;
    document.getElementById('wait-vote-msg').style.display = 'block';
}

// Esta es la función que faltaba y causaba el error
function renderScoresList(data) {
    const list = document.getElementById('scoresList');
    list.innerHTML = '';
    
    // Encontrar la puntuación máxima para calcular el porcentaje de las barras
    const maxScore = Math.max(...Object.values(data.totalScores), 1);

    // 1. Pintar la lista inicialmente (manteniendo el orden que venía de la ronda anterior)
    const playerIds = Object.keys(data.players);
    
    playerIds.forEach(id => {
        const rs = data.roundScores[id] || 0;
        const ts = data.totalScores[id] || 0;
        const name = data.players[id].name;
        const percentage = (ts / (maxScore * 1.2)) * 100; // 1.2 para dejar margen visual

        const li = document.createElement('li');
        li.className = 'score-item';
        li.id = `score-card-${id}`; // ID para poder moverlo luego
        li.setAttribute('data-total', ts); // Guardamos el valor para ordenar

        li.innerHTML = `
            <div class="score-info">
                <span><strong>${name}</strong></span>
                <div>
                    ${rs > 0 ? `<span class="round-gain-badge">+${rs}</span>` : ''}
                    <span style="margin-left:10px; font-weight:bold;">${ts} pts</span>
                </div>
            </div>
            <div class="progress-bar-container">
                <div id="bar-${id}" class="progress-bar-fill"></div>
            </div>
        `;
        list.appendChild(li);

        // Animamos la barra ligeramente después de renderizar
        setTimeout(() => {
            const bar = document.getElementById(`bar-${id}`);
            if(bar) bar.style.width = percentage + '%';
        }, 100);
    });

    // 2. Reordenar la lista tras 2.5 segundos
    setTimeout(() => {
        reorderScoreList(list);
    }, 2500);
}

function reorderScoreList(listElement) {
    const items = Array.from(listElement.children);
    
    // Ordenar de mayor a menor puntuación
    items.sort((a, b) => {
        return parseInt(b.getAttribute('data-total')) - parseInt(a.getAttribute('data-total'));
    });

    // Reordenar visualmente
    items.forEach((item, index) => {
        listElement.appendChild(item);
        
        // Limpiar clases de medallas previas si las hubiera
        item.classList.remove('gold-winner', 'silver-winner', 'bronze-winner', 'reordered');
        
        // Quitar medallas antiguas del HTML interno
        const oldMedal = item.querySelector('.medal-icon');
        if (oldMedal) oldMedal.remove();

        // Asignar nuevas medallas según la posición (index)
        const nameSpan = item.querySelector('strong');
        let medal = "";

        if (index === 0) {
            medal = '<span class="medal-icon">🥇</span>';
            item.classList.add('gold-winner', 'reordered');
        } else if (index === 1) {
            medal = '<span class="medal-icon">🥈</span>';
            item.classList.add('silver-winner');
        } else if (index === 2) {
            medal = '<span class="medal-icon">🥉</span>';
            item.classList.add('bronze-winner');
        }

        if (medal !== "") {
            nameSpan.insertAdjacentHTML('beforebegin', medal);
        }
    });
}

// Progreso de votación de temas
socket.on('updateThemeVoteProgress', (data) => {
    document.getElementById('theme-vote-count').innerText = `${data.voted} / ${data.total}`;
});

// Progreso de palabras terminadas
socket.on('updateRoundProgress', (data) => {
    document.getElementById('round-ready-count').innerText = `${data.ready} / ${data.total}`;
    
    // Aprovechamos para marcar el ✅ en la lista que ya teníamos
    const el = document.getElementById(`player-${data.playerId}`);
    if (el && !el.innerText.includes('✅')) {
        el.innerText += ' ✅';
    }
});

let myWords = [];

socket.on('startRevisionPhase', (data) => {
    showScreen('screen-results');
    const container = document.getElementById('cards-container');
    container.innerHTML = '';

    // Indicar qué número de ronda es y quién empieza
    const speakerName = document.getElementById('current-speaker-name');
    const name = players_local_cache[data.activePlayerId]?.name || "Jugador";
    speakerName.innerText = name;

    // OPCIONAL: Añadir un aviso visual de "Empieza X"
    alert("¡Fase de revisión! Esta ronda comienza leyendo: " + name);

    // Crear una tarjeta por cada jugador
    data.playerOrder.forEach(pid => {
        const card = document.createElement('div');
        card.className = `player-card ${pid === socket.id ? 'my-card' : ''}`;
        card.id = `card-${pid}`;
        
        let wordsHTML = '';
        data.allWords[pid].forEach((word, index) => {
            const isSecret = (pid !== socket.id) ? 'hidden' : '';
            wordsHTML += `
                <div class="word-slot ${isSecret}" id="slot-${pid}-${index}" 
                     onclick="handleWordClick('${pid}', ${index}, '${word}')">
                    <span class="word-text">${word}</span>
                    <span class="word-score"></span>
                </div>`;
        });

        card.innerHTML = `
            <h4>${players_local_cache[pid].name}</h4>
            <div class="card-words">${wordsHTML}</div>
            <div class="card-total">Puntos Ronda: <span id="points-${pid}">0</span></div>
        `;
        container.appendChild(card);
    });

    if (isHost) document.getElementById('host-revision-controls').style.display = 'block';
});

function handleWordClick(pid, index, wordText) {
    // 1. Si es MI palabra, la revelo
    if (pid === socket.id) {
        socket.emit('revealWord', myRoomId, wordText);
    } 
    // 2. Si es la palabra de OTRO y ya está revelada, puedo votar VETO
    else {
        const slot = document.getElementById(`slot-${pid}-${index}`);
        if (!slot.classList.contains('hidden')) {
            if(confirm("¿Votar para anular esta palabra?")) {
                socket.emit('castVeto', myRoomId, pid, index);
            }
        }
    }
}

socket.on('wordRevealed', (data) => {
    // Buscamos en todas las tarjetas quién tiene esta palabra
    // Nota: Esto asume que comparamos de forma normalizada
    const allSlots = document.querySelectorAll('.word-slot');
    
    allSlots.forEach(slot => {
        const slotText = slot.querySelector('.word-text').innerText;
        if (normalizeText(slotText) === data.word) {
            slot.classList.remove('hidden');
            
            // Actualizar color y puntos
            if (data.count > 1) {
                slot.className = 'word-slot matched';
                slot.querySelector('.word-score').innerText = `(${data.count})`;
            } else {
                slot.className = 'word-slot solo';
                slot.querySelector('.word-score').innerText = '(0)';
            }
        }
    });
    updateRealTimeScores();
});

function updateRealTimeScores() {
    // Recalcula los puntos visibles basándose en las clases 'matched'
    const players = Object.keys(players_local_cache);
    players.forEach(pid => {
        const matchedWords = document.querySelectorAll(`#card-${pid} .word-slot.matched`).length;
        // Según tu regla: X puntos donde X es el total de personas
        let total = 0;
        document.querySelectorAll(`#card-${pid} .word-slot.matched`).forEach(slot => {
            const scoreText = slot.querySelector('.word-score').innerText;
            total += parseInt(scoreText.replace(/\(|\)/g, '')) || 0;
        });
        document.getElementById(`points-${pid}`).innerText = total;
    });
}

socket.on('wordVetoed', (data) => {
    const slot = document.getElementById(`slot-${data.playerId}-${data.wordIndex}`);
    slot.className = 'word-slot hidden';
    slot.querySelector('.word-score').innerText = '';
    updateRealTimeScores();
});

function nextSpeaker() {
    socket.emit('nextSpeaker', myRoomId);
}

function finishRevision() {
    // Esta función llama al cálculo final que ya teníamos en el servidor
    socket.emit('nextRound', myRoomId); 
}

// Escuchar cuando el host cambia de turno
socket.on('newActiveSpeaker', (playerId) => {
    const speakerName = document.getElementById('current-speaker-name');
    speakerName.innerText = players_local_cache[playerId] ? players_local_cache[playerId].name : "Siguiente";
    
    // Opcional: Resaltar la tarjeta del que habla
    document.querySelectorAll('.player-card').forEach(c => c.style.borderColor = "#ddd");
    const activeCard = document.getElementById(`card-${playerId}`);
    if(activeCard) activeCard.style.borderColor = "#ffc107"; // Color amarillo/dorado para el turno
});