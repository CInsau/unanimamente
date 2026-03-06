const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // Almacena el estado de cada sala
const themes = [
    "Cocina", "Baño", "Dormitorio", "Jardín", "Herramientas", "Limpieza", "Mudanza", "Mascotas", 
    "Desayuno", "Electrodomésticos", "Decoración", "Vecinos", "Infancia", "Boda", "Jubilación",
    "Reunión", "Escritorio", "Papelería", "Informática", "Entrevista", "Éxito", "Lunes", 
    "Salario", "Jefe", "Compañeros", "Proyecto", "Estrés", "Cafetería", "Horario", "Ascensor",
    "Fruta", "Verdura", "Postre", "Bebida", "Especias", "Panadería", "Restaurante", "Picnic", 
    "Supermercado", "Dieta", "Maleta", "Aeropuerto", "Hotel", "Playa", "Montaña", "Camping", 
    "Crucero", "Mapa", "Aventura", "Souvenir", "Fotografía", "Museos", "Concierto", "Cine", 
    "Lectura", "Clima", "Invierno", "Verano", "Selva", "Desierto", "Océano", "Espacio", 
    "Granja", "Flores", "Volcán", "Música", "Pintura", "Teatro", "Danza", "Moda", "Historia", 
    "Literatura", "Mitología", "Magia", "Circo", "Gimnasio", "Fútbol", "Relajación", "Hospital", 
    "Farmacia", "Energía", "Entrenamiento", "Victoria", "Bicicleta", "Natación", "Tiempo", 
    "Dinero", "Suerte", "Miedo", "Felicidad", "Comunicación", "Tecnología", "Transporte", 
    "Compras", "Regalo", "Futuro", "Noche", "Ciudad", "Cine", "Colores"
];

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
		room.state = 'voting_theme';
		room.themeVotes = {}; // Guardar votos: {socketId: temaIndex}
		
		// Seleccionar 2 temas al azar
		const option1 = themes[Math.floor(Math.random() * themes.length)];
		const option2 = themes[Math.floor(Math.random() * themes.length)];
		room.currentOptions = [option1, option2];

		io.to(roomId).emit('startThemeVote', { options: room.currentOptions });
	}

	// Escuchar los votos de los temas
	socket.on('castThemeVote', (roomId, optionIndex) => {
		const room = rooms[roomId];
		if (room && room.state === 'voting_theme') {
			room.themeVotes[socket.id] = optionIndex;
			
			// Si todos han votado, decidir tema
			if (Object.keys(room.themeVotes).length === Object.keys(room.players).length) {
				decideTheme(roomId);
			}
		}
	});

	function decideTheme(roomId) {
		const room = rooms[roomId];
		const votes = Object.values(room.themeVotes);
		const count0 = votes.filter(v => v === 0).length;
		const count1 = votes.filter(v => v === 1).length;

		let chosenTheme;
		if (count0 > count1) {
			chosenTheme = room.currentOptions[0];
		} else if (count1 > count0) {
			chosenTheme = room.currentOptions[1];
		} else {
			// Empate: decide el host
			const hostVote = room.themeVotes[room.host];
			// Si el host no votó por alguna razón, elegimos el primero
			chosenTheme = room.currentOptions[hostVote !== undefined ? hostVote : 0];
		}

		room.state = 'playing';
		room.words = {};
		io.to(roomId).emit('roundStarted', { 
			round: room.currentRound, 
			theme: chosenTheme, 
			time: room.settings.time 
		});
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
			let roundScores = {};
			
			// Inicializar puntos de la ronda a 0 para todos
			for (let pid in room.players) {
				roundScores[pid] = 0;
			}

			// Recorrer cada palabra del listado final tras la revisión
			for (let word in room.currentWordCounts) {
				let numPlayers = room.currentWordCounts[word].count;
				
				// Si la palabra la tiene más de una persona, es un acierto
				if (numPlayers > 1) {
					// Cada jugador que puso esa palabra recibe exactamente 1 PUNTO
					room.currentWordCounts[word].players.forEach(pid => {
						roundScores[pid] += 1; // <--- CAMBIO CLAVE: Antes sumaba 'count'
						room.scores[pid] += 1; 
					});
				}
			}
			
			io.to(roomId).emit('showScores', { 
				roundScores, 
				totalScores: room.scores, 
				players: room.players 
			});
            
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