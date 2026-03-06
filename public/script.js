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
        list.innerHTML += `<li>${players[id].name}</li>`;
    }
});

function startGame() {
    const rounds = document.getElementById('configRounds').value;
    const time = document.getElementById('configTime').value;
    socket.emit('startGame', myRoomId, { rounds, time });
}

socket.on('roundStarted', (data) => {
    document.getElementById('themeDisplay').innerText = data.theme;
    document.getElementById('btnSubmit').disabled = false;
    
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
    document.getElementById('btnSubmit').disabled = true;
    let words = [];
    for(let i=1; i<=8; i++){
        words.push(document.getElementById(`word${i}`).value);
    }
    socket.emit('submitWords', myRoomId, words);
}

// Mostrar resultados y preparar votaciones
socket.on('showResults', (wordCounts) => {
    renderResults(wordCounts);
    showScreen('screen-results');
    if (isHost) document.getElementById('hostResultsControls').style.display = 'block';
});

function renderResults(wordCounts) {
    const list = document.getElementById('resultsList');
    list.innerHTML = '';
    const sortedWords = Object.keys(wordCounts).sort((a, b) => wordCounts[b].count - wordCounts[a].count);
    
    sortedWords.forEach(word => {
        let li = document.createElement('li');
        li.innerHTML = `<strong>${word}</strong> (${wordCounts[word].count} personas) 
        <button onclick="requestMerge('${word}')">Unir a otra...</button>`;
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
    list.innerHTML = '';
    for (let id in data.players) {
        let roundScore = data.roundScores[id] || 0;
        let totalScore = data.totalScores[id] || 0;
        list.innerHTML += `<li>${data.players[id].name}: +${roundScore} esta ronda | Total: ${totalScore}</li>`;
    }
    showScreen('screen-scores');
});

socket.on('gameOver', (data) => {
    alert("¡Juego terminado!");
    // Aquí podrías añadir un botón de "Volver a jugar" que recargue la página.
});