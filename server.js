const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // Almacena el estado de cada sala
const themes = ["Cosas en una oficina", "Para llevar a la playa", "Marcas de coches", "Comida italiana", "Lenguajes de programación"];

io.on('connection', (socket) => {
    // Unirse o crear sala
    socket.on('joinRoom', ({ roomId, playerName }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                host: socket.id,
                players: {},
                settings: { rounds: 3, time: 60 },
                currentRound: 0,
                state: 'lobby',
                words: {}, // palabras de la ronda actual
                scores: {}
            };
        }
        rooms[roomId].players[socket.id] = { name: playerName, ready: false };
        rooms[roomId].scores[socket.id] = rooms[roomId].scores[socket.id] || 0;
        
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        socket.emit('roomJoined', { roomId, isHost: rooms[roomId].host === socket.id });
    });

    // Iniciar partida
    socket.on('startGame', (roomId, settings) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.settings = settings;
            room.currentRound = 1;
            startRound(roomId);
        }
    });

    function startRound(roomId) {
        const room = rooms[roomId];
        room.state = 'playing';
        room.words = {};
        const theme = themes[Math.floor(Math.random() * themes.length)];
        io.to(roomId).emit('roundStarted', { round: room.currentRound, theme, time: room.settings.time });
    }

    // Recibir palabras
    socket.on('submitWords', (roomId, wordsArray) => {
        const room = rooms[roomId];
        if (room) {
            room.words[socket.id] = wordsArray.map(w => w.toLowerCase().trim()).filter(w => w);
            // Si todos enviaron, ir a resultados
            if (Object.keys(room.words).length === Object.keys(room.players).length) {
                processResults(roomId);
            }
        }
    });

    function processResults(roomId) {
        const room = rooms[roomId];
        room.state = 'results';
        // Agrupar palabras
        let wordCounts = {};
        for (let playerId in room.words) {
            room.words[playerId].forEach(word => {
                if (!wordCounts[word]) wordCounts[word] = { count: 0, players: [] };
                wordCounts[word].count++;
                if (!wordCounts[word].players.includes(playerId)) {
                    wordCounts[word].players.push(playerId);
                }
            });
        }
        room.currentWordCounts = wordCounts;
        io.to(roomId).emit('showResults', wordCounts);
    }

    // Proponer votación para unir palabras (ej. "coches" -> "coche")
    socket.on('proposeMerge', (roomId, oldWord, newWord) => {
        const room = rooms[roomId];
        if (room) {
            room.currentVote = { oldWord, newWord, votes: {}, yesNeeded: Object.keys(room.players).length };
            io.to(roomId).emit('startVote', { oldWord, newWord, proposer: rooms[roomId].players[socket.id].name });
        }
    });

    socket.on('castVote', (roomId, isYes) => {
        const room = rooms[roomId];
        if (room && room.currentVote) {
            room.currentVote.votes[socket.id] = isYes;
            const totalVotes = Object.keys(room.currentVote.votes).length;
            
            if (totalVotes === room.currentVote.yesNeeded) {
                // Chequear si es unánime
                const allYes = Object.values(room.currentVote.votes).every(v => v === true);
                if (allYes) {
                    // Fusionar palabras
                    const oldW = room.currentVote.oldWord;
                    const newW = room.currentVote.newWord;
                    room.currentWordCounts[newW].count += room.currentWordCounts[oldW].count;
                    room.currentWordCounts[newW].players.push(...room.currentWordCounts[oldW].players);
                    delete room.currentWordCounts[oldW];
                }
                io.to(roomId).emit('voteEnded', { success: allYes, wordCounts: room.currentWordCounts });
                room.currentVote = null;
            }
        }
    });

    // Calcular puntuaciones y siguiente ronda
    socket.on('nextRound', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            // Repartir puntos: 1 punto por cada coincidencia
            let roundScores = {};
            for (let word in room.currentWordCounts) {
                let count = room.currentWordCounts[word].count;
                if (count > 1) {
                    room.currentWordCounts[word].players.forEach(pid => {
                        room.scores[pid] += count;
                        roundScores[pid] = (roundScores[pid] || 0) + count;
                    });
                }
            }
            
            io.to(roomId).emit('showScores', { roundScores, totalScores: room.scores, players: room.players });
            
            setTimeout(() => {
                if (room.currentRound < room.settings.rounds) {
                    room.currentRound++;
                    startRound(roomId);
                } else {
                    io.to(roomId).emit('gameOver', { totalScores: room.scores, players: room.players });
                }
            }, 5000); // Muestra puntos 5 seg y sigue
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});