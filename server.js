const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server, {resource: '/borrelio/socket.io'})

app.use('/', express.static('public'))

const roomUsers = {};

io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    const users = roomUsers[roomId];
    const numberOfClients = users ? Object.keys(roomUsers[roomId]).length : 0;

    // These events are emitted only to the sender socket.
    if (numberOfClients === 0) {
      roomUsers[roomId] = {};
      console.log(`Creating room ${roomId} and emitting room_created socket event`)
      socket.join(roomId)
      socket.emit('room_created', roomId)
    } else if (numberOfClients < 10) {
      console.log(`Joining room ${roomId} and emitting room_joined socket event`)
      socket.join(roomId)
      socket.emit('room_joined', roomId)
    } else {
      console.log(`Can't join room ${roomId}, emitting full_room socket event`)
      socket.emit('full_room', roomId)
    }
    roomUsers[roomId][socket.id] = {
      location: [250, 250],
      name: 'User'
    };
    console.log(roomUsers[roomId]);
    socket.emit('users', roomUsers[roomId]);
    socket.broadcast.to(roomId).emit('users', roomUsers[roomId]);
  })

  socket.on('leave', (roomId) => {
    console.log(`User ${socket.id} is leaving room ${roomId}.`);
    try {
      delete roomUsers[roomId][socket.id];
    } catch(err) { }


    if (roomUsers[roomId] && Object.keys(roomUsers[roomId]).length === 0) {
      try {
        delete roomUsers[roomId];
      } catch(err) { }
    } else {
      socket.broadcast.to(roomId).emit('users', roomUsers[roomId]);
    }
  })

  socket.on('update_location', (event) => {
    console.log(`Updating location of user ${socket.id} in room ${event.roomId} to position ${event.location}`)
    roomUsers[event.roomId][socket.id].location = event.location;
    // TODO: only send the updated location
    socket.broadcast.to(event.roomId).emit('users', roomUsers[event.roomId])
  });

  socket.on('update_name', (event) => {
    console.log(`Updating name of user ${socket.id} in room ${event.roomId} to ${event.newName}`)
    roomUsers[event.roomId][socket.id].name = event.newName;
    // TODO: only send the updated location
    socket.broadcast.to(event.roomId).emit('users', roomUsers[event.roomId])
  });

  // These events are emitted to all the sockets connected to the same room except the sender.
  socket.on('start_call', (roomId) => {
    console.log(`Broadcasting start_call event to peers in room ${roomId}`)
    socket.broadcast.to(roomId).emit('start_call', {userId: socket.id})
  })
  socket.on('webrtc_offer', (event) => {
    console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId} to user ${event.userId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_offer', { sdp: event.sdp, userId: event.userId, senderId: socket.id } )
  })
  socket.on('webrtc_answer', (event) => {
    console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_answer', { sdp: event.sdp, userId: event.userId, senderId: socket.id } )
  })
  socket.on('webrtc_ice_candidate', (event) => {
    console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`)
    socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', {userId: event.userId, label: event.label, candidate: event.candidate, senderId: socket.id})
  })
})

// START THE SERVER =================================================================
const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log(`Express server listening on port ${port}`)
})
