const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
  socket.on('createRoom', (cb) => {
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[id] = { 
        players: {}, 
        collected: 0, 
        started: false,
        host: socket.id 
    };
    socket.join(id);
    rooms[id].players[socket.id] = { x: 0, z: 0, alive: true, sanity: 1 };
    cb({ roomId: id, isHost: true });
  });

  socket.on('joinRoom', ({ roomId }, cb) => {
    if (!rooms[roomId]) return cb({ error: 'Sala não existe' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { x: 0, z: 0, alive: true, sanity: 1 };
    
    // Avisar o host que alguém entrou
    io.to(rooms[roomId].host).emit('updateLobby', Object.keys(rooms[roomId].players).length);
    
    cb({ success: true, isHost: false, started: rooms[roomId].started });
  });

  socket.on('startGame', ({ roomId }) => {
    if (rooms[roomId] && rooms[roomId].host === socket.id) {
        rooms[roomId].started = true;
        io.to(roomId).emit('gameStarted');
    }
  });

  socket.on('move', ({ roomId, x, z, yaw }) => {
    if (!rooms[roomId] || !rooms[roomId].players[socket.id]) return;
    rooms[roomId].players[socket.id] = { ...rooms[roomId].players[socket.id], x, z, yaw };
    socket.to(roomId).emit('playerMoved', { id: socket.id, x, z, yaw });
  });

  socket.on('collectManual', ({ roomId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].collected++;
    io.to(roomId).emit('manualCount', rooms[roomId].collected);
    if (rooms[roomId].collected >= 6) {
      io.to(roomId).emit('gameWon');
    }
  });

  socket.on('died', ({ roomId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].players[socket.id].alive = false;
    io.to(roomId).emit('playerDied', { id: socket.id });
    const allDead = Object.values(rooms[roomId].players).every(p => !p.alive);
    if (allDead) io.to(roomId).emit('gameOver');
  });

  socket.on('respawn', ({ roomId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].players[socket.id].alive = true;
    io.to(roomId).emit('playerRespawned', { id: socket.id });
  });

  socket.on('disconnect', () => {
    for (const r in rooms) {
      if (rooms[r].players[socket.id]) {
        const wasHost = rooms[r].host === socket.id;
        delete rooms[r].players[socket.id];
        io.to(r).emit('playerLeft', { id: socket.id });
        
        // Se o host sair, passa a host para outro
        if (wasHost && Object.keys(rooms[r].players).length > 0) {
            rooms[r].host = Object.keys(rooms[r].players)[0];
        }
        
        if (Object.keys(rooms[r].players).length === 0) delete rooms[r];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Servidor na porta ' + PORT));
