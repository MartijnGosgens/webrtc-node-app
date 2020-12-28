const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)

app.use('/', express.static('public'))

const locations = {};

io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    const roomClients = io.sockets.adapter.rooms[roomId] || { length: 0 }
    const numberOfClients = roomClients.length;

    // These events are emitted only to the sender socket.
    if (numberOfClients === 0) {
      locations[roomId] = {};
      console.log(`Creating room ${roomId} and emitting room_created socket event`)
      socket.join(roomId)
      socket.emit('room_created', roomId)
    } else if (numberOfClients < 5) {
      console.log(`Joining room ${roomId} and emitting room_joined socket event`)
      socket.join(roomId)
      socket.emit('room_joined', roomId)
    } else {
      console.log(`Can't join room ${roomId}, emitting full_room socket event`)
      socket.emit('full_room', roomId)
    }

    locations[roomId][socket.id] = [0, 0];
    console.log(locations);
    socket.emit('locations', locations[roomId]);
  })

  socket.on('leave', (roomId) => {
    console.log(`User ${socket.id} is leaving room ${roomId}.`);
    delete locations[roomId][socket.id];
    if (Object.keys(locations[roomId]).length === 0) {
      delete locations[roomId];
    } else {
      socket.broadcast.to(roomId).emit('locations', locations[roomId]);
    }
    console.log(locations);
  })

  socket.on('update_location', (event) => {
    console.log(`Updating location of user ${socket.id} in room ${event.roomId} to position ${event.location}`)
    locations[event.roomId][socket.id] = event.location;
    socket.broadcast.to(event.roomId).emit('locations', locations[event.roomId])
  });

  // These events are emitted to all the sockets connected to the same room except the sender.
  socket.on('start_call', (roomId) => {
    console.log(`Broadcasting start_call event to peers in room ${roomId}`)
    socket.broadcast.to(roomId).emit('start_call')
  })
  socket.on('webrtc_offer', (event) => {
    console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_offer', event.sdp)
  })
  socket.on('webrtc_answer', (event) => {
    console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_answer', event.sdp)
  })
  socket.on('webrtc_ice_candidate', (event) => {
    console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', event)
  })
})

// START THE SERVER =================================================================
const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log(`Express server listening on port ${port}`)
})
