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
    socket.on('joinRoom', (roomId, playerName) => {
		// 1. Si la sala no existe, la creamos y asignamos al Host
		if (!rooms[roomId]) {
			rooms[roomId] = {
				host: socket.id, // <--- Aquí guardamos el ID del creador
				players: {},
				settings: { rounds: 3, time: 60 },
				currentRound: 0,
				state: 'lobby',
				words: {},
				scores: {},
				usedThemes: []
			};
			console.log(`Sala ${roomId} creada por ${socket.id}`);
		}
	
		// 2. Añadimos al jugador (ya sea host o invitado)
		rooms[roomId].players[socket.id] = { name: playerName, ready: false };
		rooms[roomId].scores[socket.id] = 0;
	
		// 3. ENVIAR EL EVENTO (Asegúrate de que 'hostId' apunta a rooms[roomId].host)
		const roomData = { 
			roomId: String(roomId),  // Forzamos que sea un texto
			hostId: rooms[roomId].host 
		};
	
		console.log("Enviando a cliente:", roomData); // Mira tu terminal de Node para confirmar
		
		socket.emit('roomJoined', roomData);
	
		socket.join(roomId);
		// Notificamos al resto de la sala
		io.to(roomId).emit('updatePlayers', rooms[roomId].players);
	});

    // Iniciar partida
	socket.on('startGame', (roomId, settings) => {
		// Forzamos que el roomId sea string por si acaso
		const id = String(roomId);
		const room = rooms[id];
		
		if (room && room.host === socket.id) {
			// Guardamos la configuración enviada por el host
			room.settings = settings;
			room.currentRound = 1;
			console.log(`Partida iniciada en sala ${id} con configuración:`, settings);
			startRound(id);
		} else {
			console.log("Error al iniciar: sala no encontrada o no es el host", id);
		}
	});

    function startRound(roomId) {
		const room = rooms[roomId];
		room.state = 'voting_theme';
		room.themeVotes = {};

		// 1. Filtrar los temas que NO han sido usados todavía
		const availableThemes = themes.filter(t => !room.usedThemes.includes(t));

		// 2. Si por alguna razón nos quedamos sin temas (partida larguísima), reseteamos la lista
		const pool = availableThemes.length >= 2 ? availableThemes : themes;

		// 3. Seleccionar 2 temas al azar del grupo de disponibles
		// Usamos un pequeño truco de desordenar el array (shuffle) y coger los 2 primeros
		const shuffled = pool.sort(() => 0.5 - Math.random());
		const option1 = shuffled[0];
		const option2 = shuffled[1];

		room.currentOptions = [option1, option2];

		// 4. Añadimos AMBOS temas a la lista de usados para que no vuelvan a salir como opción
		room.usedThemes.push(option1, option2);

		io.to(roomId).emit('startThemeVote', { 
			options: room.currentOptions,
			total_players_info: Object.keys(room.players).length // Aprovechamos para el contador x/total
		});
	}

	// Escuchar los votos de los temas
	socket.on('castThemeVote', (roomId, optionIndex) => {
		const room = rooms[roomId];
		if (room && room.state === 'voting_theme') {
			room.themeVotes[socket.id] = optionIndex;
			
			const totalPlayers = Object.keys(room.players).length;
			const votedCount = Object.keys(room.themeVotes).length;

			// Avisamos a todos de cuántos han votado
			io.to(roomId).emit('updateThemeVoteProgress', { 
				voted: votedCount, 
				total: totalPlayers 
			});
			
			if (votedCount === totalPlayers) {
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

		// Obtenemos el número total de jugadores en la sala
		const totalPlayers = Object.keys(room.players).length;

		io.to(roomId).emit('roundStarted', { 
			round: room.currentRound, 
			theme: chosenTheme, 
			time: room.settings.time,
			totalPlayers: totalPlayers // <--- ENVIAMOS EL TOTAL AQUÍ
		});
	}

    // Recibir palabras
    socket.on('submitWords', (roomId, wordsArray) => {
		const room = rooms[roomId];
		if (room && room.players[socket.id]) {
			room.words[socket.id] = wordsArray.map(w => normalizeText(w)).filter(w => w);
			room.players[socket.id].ready = true;
			
			const totalPlayers = Object.keys(room.players).length;
			const readyCount = Object.values(room.players).filter(p => p.ready).length;

			// Avisamos a todos del progreso de la ronda
			io.to(roomId).emit('updateRoundProgress', { 
				ready: readyCount, 
				total: totalPlayers,
				playerId: socket.id
			});

			if (readyCount === totalPlayers) {
				for (let id in room.players) room.players[id].ready = false;
				processResults(roomId);
			}
		}
	});

    function processResults(roomId) {
		const room = rooms[roomId];
		room.state = 'revision';
		
		// Obtenemos la lista fija de IDs de jugadores
		const playerIds = Object.keys(room.players);
		const numPlayers = playerIds.length;

		// Calculamos quién debe empezar esta ronda (0 para la primera, 1 para la segunda, etc.)
		// Usamos el módulo (%) para que si hay más rondas que jugadores, vuelva a empezar el ciclo
		const startingIndex = (room.currentRound - 1) % numPlayers;

		// Reordenamos el array de turnos para esta ronda
		// Cogemos desde el que empieza hasta el final, y le pegamos el principio al final
		room.playerOrder = [
			...playerIds.slice(startingIndex),
			...playerIds.slice(0, startingIndex)
		];

		room.activePlayerIndex = 0; // El índice local del turno de revisión (siempre empieza en 0 del nuevo array)
		room.revealedWords = {};
		room.pendingVetoes = {};

		io.to(roomId).emit('startRevisionPhase', {
			playerOrder: room.playerOrder,
			allWords: room.words,
			activePlayerId: room.playerOrder[0] // El ID del jugador que le toca empezar
		});
	}

	// Evento cuando un jugador pulsa su propia palabra para decirla
	socket.on('revealWord', (roomId, wordText) => {
		const room = rooms[roomId];
		if (!room || room.state !== 'revision') return;

		// Normalizamos para comparar
		const norm = normalizeText(wordText);
		
		if (!room.revealedWords[norm]) {
			room.revealedWords[norm] = [];
		}
		
		// Si el jugador no estaba ya en esa palabra, lo añadimos
		if (!room.revealedWords[norm].includes(socket.id)) {
			room.revealedWords[norm].push(socket.id);
		}

		// Calculamos puntos en tiempo real para esta palabra
		const count = room.revealedWords[norm].length;
		
		io.to(roomId).emit('wordRevealed', {
			word: norm,
			originalText: wordText,
			playerId: socket.id,
			count: count,
			allPlayersInWord: room.revealedWords[norm]
		});
	});

	// Sistema de Veto (Votar en contra)
	socket.on('castVeto', (roomId, targetPlayerId, wordIndex) => {
		const room = rooms[roomId];
		const vetoKey = `${targetPlayerId}_${wordIndex}`;
		
		if (!room.pendingVetoes[vetoKey]) room.pendingVetoes[vetoKey] = new Set();
		room.pendingVetoes[vetoKey].add(socket.id);

		const totalPlayers = Object.keys(room.players).length;
		if (room.pendingVetoes[vetoKey].size > totalPlayers / 2) {
			// VETO APROBADO: Ocultar palabra de nuevo
			io.to(roomId).emit('wordVetoed', { playerId: targetPlayerId, wordIndex });
			delete room.pendingVetoes[vetoKey];
		}
	});

	socket.on('nextSpeaker', (roomId) => {
		const room = rooms[roomId];
		if (room && room.host === socket.id) {
			room.activePlayerIndex++;
			if (room.activePlayerIndex < room.playerOrder.length) {
				io.to(roomId).emit('newActiveSpeaker', room.playerOrder[room.activePlayerIndex]);
			}
		}
	});

    // Calcular puntuaciones y siguiente ronda
    socket.on('nextRound', (roomId) => {
		const room = rooms[roomId];
		if (room && room.host === socket.id) {
			let roundScores = {};
			for (let pid in room.players) roundScores[pid] = 0;

			for (let word in room.currentWordCounts) {
				let numPlayers = room.currentWordCounts[word].count;
				if (numPlayers > 1) {
					room.currentWordCounts[word].players.forEach(pid => {
						roundScores[pid] += numPlayers;
						room.scores[pid] += numPlayers; 
					});
				}
			}
			
			// Enviamos las puntuaciones, pero NO programamos la siguiente ronda automáticamente
			io.to(roomId).emit('showScores', { 
				roundScores, 
				totalScores: room.scores, 
				players: room.players,
				isLastRound: room.currentRound >= room.settings.rounds // Avisamos si es el final
			});
		}
	});
	
	// NUEVO EVENTO: El Host decide pasar de ronda manualmente
	socket.on('proceedToNextRound', (roomId) => {
		const room = rooms[roomId];
		if (room && room.host === socket.id) {
			if (room.currentRound < room.settings.rounds) {
				room.currentRound++;
				startRound(roomId); // Función que ya tenemos para iniciar votación de temas
			} else {
				io.to(roomId).emit('gameOver', { totalScores: room.scores, players: room.players });
			}
		}
	});
	
	// Reiniciar sala para nueva partida
    socket.on('resetRoom', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.state = 'lobby';
            room.currentRound = 0;
            room.words = {};
			room.usedThemes = [];
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

	socket.on('wordClicked', (data) => {
		const { roomId, playerId, wordIndex, word } = data;
		
		// Validamos que la sala existe
		if (rooms[roomId]) {
			console.log(`Palabra revelada en sala ${roomId}: ${word} (Jugador: ${playerId})`);
			
			// Reenviamos a TODOS en la sala (incluyendo al que hizo clic)
			// para que sus pantallas se actualicen y calculen puntos
			io.to(roomId).emit('wordRevealed', {
				playerId: playerId,
				wordIndex: wordIndex,
				word: word
			});
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