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
			// Normalizamos cada palabra antes de guardarla
			room.words[socket.id] = wordsArray
				.map(w => normalizeText(w)) // <--- CAMBIO AQUÍ
				.filter(w => w); // Quita vacíos

			// Si todos enviaron, ir a resultados
			if (Object.keys(room.words).length === Object.keys(room.players).length) {
				processResults(roomId);
			}
		}
	});

    function processResults(roomId) {
		const room = rooms[roomId];
		room.state = 'results';
		
		let wordCounts = {};
		for (let playerId in room.words) {
			room.words[playerId].forEach(word => {
				if (!wordCounts[word]) wordCounts[word] = { count: 0, players: [] };
				wordCounts[word].count++;
				if (!wordCounts[word].players.includes(playerId)) {
					room.currentWordCounts = wordCounts; // Guardar estado actual
					wordCounts[word].players.push(playerId);
				}
			});
		}
		// room.currentWordCounts = wordCounts; // Ya se guarda arriba
		io.to(roomId).emit('showResults', wordCounts);
	}
	
	// ACTUALIZADO: Fusión DIRECTA (Solo el Host puede llamar esto, no hay votación)
	// Eliminamos 'proposeMerge', 'startVote', 'castVote', 'voteEnded'
	socket.on('forceMerge', (roomId, oldWord, newWord) => {
		const room = rooms[roomId];
		// Verificación de seguridad: solo el host puede hacer esto
		if (room && room.host === socket.id && room.state === 'results') {
			
			// Verificamos que ambas palabras existan en la ronda actual
			if (room.currentWordCounts[oldWord] && room.currentWordCounts[newWord]) {
				
				// Fusionar datos
				room.currentWordCounts[newWord].count += room.currentWordCounts[oldWord].count;
				
				// Combinar listas de jugadores (evitando duplicados si alguien puso ambas, aunque Unánimo no suele permitirlo)
				const combinedPlayers = new Set([
					...room.currentWordCounts[newWord].players,
					...room.currentWordCounts[oldWord].players
				]);
				room.currentWordCounts[newWord].players = Array.from(combinedPlayers);
				
				// Eliminar la palabra antigua
				delete room.currentWordCounts[oldWord];
				
				// Notificar a todos los jugadores de la actualización inmediata de la lista
				io.to(roomId).emit('updateResultsList', room.currentWordCounts);
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
	
	// Reiniciar sala para nueva partida
    socket.on('resetRoom', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.state = 'lobby';
            room.currentRound = 0;
            room.words = {};
            // Mantener los jugadores y sus puntuaciones totales si quieres, 
            // o resetear puntuaciones a 0:
            for (let pid in room.scores) room.scores[pid] = 0;
            
            io.to(roomId).emit('roomReseted');
        }
    });
	
	socket.on('submitWords', (roomId, wordsArray) => {
		const room = rooms[roomId];
		if (room && room.players[socket.id]) {
			// Guardamos las palabras
			room.words[socket.id] = wordsArray.map(w => normalizeText(w)).filter(w => w);
			
			// Marcamos al jugador como "listo" para esta ronda
			room.players[socket.id].ready = true;
			
			// Avisamos a todos para que aparezca la marca visual
			io.to(roomId).emit('playerReady', socket.id);

			// Si todos enviaron, procesamos resultados
			if (Object.keys(room.words).length === Object.keys(room.players).length) {
				// Antes de procesar, reseteamos el estado ready para la siguiente ronda o lobby
				for (let id in room.players) room.players[id].ready = false;
				processResults(roomId);
			}
		}
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// NUEVA FUNCIÓN AUXILIAR: Normalizar texto (quita tildes y pasa a minúsculas)
function normalizeText(text) {
    return text
        .trim()
        .toLowerCase()
        .normalize("NFD") // Separa la letra de la tilde
        .replace(/[\u0300-\u036f]/g, ""); // Elimina los símbolos de tilde
}