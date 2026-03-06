const socket = io();
let myRoomId = '';
let isHost = false;
let gameTimer;

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
    isHost = data.isHost;
    document.getElementById('displayRoomId').innerText = data.roomId;
    if (isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('waitMessage').style.display = 'none';
    }
    showScreen('screen-lobby');
});

socket.on('updatePlayers', (players) => {
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
    const list = document.getElementById('scoresList');
    list.innerHTML = '<h3>Resultados de la Ronda</h3>';
    
    // Ordenar por quién ha ganado más en ESTA ronda
    const sortedIds = Object.keys(data.players).sort((a, b) => (data.roundScores[b] || 0) - (data.roundScores[a] || 0));

    sortedIds.forEach(id => {
        let rs = data.roundScores[id] || 0;
        let ts = data.totalScores[id] || 0;
        let wordS = rs === 1 ? "coincidencia" : "coincidencias";
        
        list.innerHTML += `
            <li class="score-item">
                <strong>${data.players[id].name}</strong>: 
                <span class="round-gain">+${rs} ${wordS}</span> 
                <span class="total-score">(Total: ${ts})</span>
            </li>`;
    });
    showScreen('screen-scores');
});

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
});

function voteTheme(index) {
    socket.emit('castThemeVote', myRoomId, index);
    document.getElementById('theme-opt-0').disabled = true;
    document.getElementById('theme-opt-1').disabled = true;
    document.getElementById('wait-vote-msg').style.display = 'block';
}