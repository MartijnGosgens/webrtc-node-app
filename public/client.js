// DOM elements.
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')

const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('video-1')
const remoteVideoComponents = [document.getElementById('video-2'),
                               document.getElementById('video-3')]

// Variables.
const socket = io()
const mediaConstraints = {
  audio: true,
  video: { width: 1280, height: 720 },
}
let localStream
let remoteStream
let isRoomCreator
let rtcPeerConnection // Connection between the local device and the remote peer.
let roomId
let people = {}

// Free public STUN servers provided by Google.
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
}

const STEP = 10;
const Direction = {
  LEFT: 0,
  UP: 1,
  RIGHT: 2,
  DOWN: 3
};

const canvas = new fabric.Canvas('canvas', {
  width: 10000,
  height: 10000,
});

// BUTTON LISTENER ============================================================
function distance(l1, l2) {
  return (
      (l1[0] - l2[0])**2
      + (l1[1]-l2[1])**2
  ) ** 0.5
}

// SOCKET EVENT CALLBACKS =====================================================
socket.on('locations', async (roomLocations) => {
  console.log('Socket event callback: locations')

  for (const [userId, location] of Object.entries(roomLocations)) {
    if (people.hasOwnProperty(userId)) {
      people[userId].location = location;
      people[userId].distance = distance(location, roomLocations[socket.id]);
      updateAvatarPosition(people[userId].avatar, location);
    } else {
      console.log(userId, socket.id)
      people[userId] = {
        location,
        avatar: initializeAvatar(location, userId === socket.id),
        distance: distance(location, roomLocations[socket.id])
      }
    }
  }
  console.log(socket.id, people);
  canvas.renderAll();
})

function updateAvatarPosition(avatar, location) {
  avatar.setLeft(location[0]);
  avatar.setTop(location[1]);
  avatar.setCoords();
}

function initializeAvatar(location, own) {
  const avatar = new fabric.Circle({
    left: location[0],
    top: location[1],
    radius: 25,
    fill: own ? '#138913' : '#a21818',
    lockUniScaling: true,
    hasControls: false,
    hasBorders: false,
    'selectable': own,
    'evented': own
  });
  canvas.add(avatar);
  if (own) {
    canvas.setActiveObject(avatar);
  }
  return avatar;
}

socket.on('room_created', async () => {
  console.log('Socket event callback: room_created')

  await setLocalStream(mediaConstraints)
  isRoomCreator = true
})

socket.on('room_joined', async () => {
  console.log('Socket event callback: room_joined')

  await setLocalStream(mediaConstraints)
  socket.emit('start_call', roomId)
})

socket.on('full_room', () => {
  console.log('Socket event callback: full_room')

  alert('The room is full, please try another one')
})

socket.on('start_call', async () => {
  console.log('Socket event callback: start_call')

  if (isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = setRemoteStream
    rtcPeerConnection.onicecandidate = sendIceCandidate
    await createOffer(rtcPeerConnection)
  }
})

socket.on('webrtc_offer', async (event) => {
  console.log('Socket event callback: webrtc_offer')

  if (!isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = setRemoteStream
    rtcPeerConnection.onicecandidate = sendIceCandidate
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
    await createAnswer(rtcPeerConnection)
  }
})

socket.on('webrtc_answer', (event) => {
  console.log('Socket event callback: webrtc_answer')

  rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
})

socket.on('webrtc_ice_candidate', (event) => {
  console.log('Socket event callback: webrtc_ice_candidate')

  // ICE candidate configuration.
  var candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  })
  rtcPeerConnection.addIceCandidate(candidate)
})

// FUNCTIONS ==================================================================
function joinRoom(room) {
  if (room === '') {
    alert('Please type a room ID')
  } else {
    roomId = room
    socket.emit('join', room)
    showVideoConference()
  }
}

function showVideoConference() {
  roomSelectionContainer.style = 'display: none'
  videoChatContainer.style = 'display: block'
}

async function setLocalStream(mediaConstraints) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    console.log(stream);
  } catch (error) {
    console.error('Could not get user media', error)
  }

  localStream = stream
  localVideoComponent.srcObject = stream
}

function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    console.log(track);
    rtcPeerConnection.addTrack(track, localStream)
  })
}

async function createOffer(rtcPeerConnection) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createOffer()
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  socket.emit('webrtc_offer', {
    type: 'webrtc_offer',
    sdp: sessionDescription,
    roomId,
  })
}

async function createAnswer(rtcPeerConnection) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createAnswer()
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  socket.emit('webrtc_answer', {
    type: 'webrtc_answer',
    sdp: sessionDescription,
    roomId,
  })
}

function setRemoteStream(event) {
  console.log('event', event);
  event.streams.forEach((stream, index) => {
    if (index < remoteVideoComponents.length) {
      remoteVideoComponents[index].srcObject = stream;
    }
  })
  remoteStream = event.stream
}

function sendIceCandidate(event) {
  if (event.candidate) {
    socket.emit('webrtc_ice_candidate', {
      roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
    })
  }
}

window.onbeforeunload = function ()
{
  socket.emit('leave', roomId)
}

fabric.util.addListener(document.body, 'keydown', function(options) {
  var key = options.which || options.keyCode; // key detection
  if (key === 37) { // handle Left key
    moveSelected(Direction.LEFT);
  } else if (key === 38) { // handle Up key
    moveSelected(Direction.UP);
  } else if (key === 39) { // handle Right key
    moveSelected(Direction.RIGHT);
  } else if (key === 40) { // handle Down key
    moveSelected(Direction.DOWN);
  }
});

canvas.on('object:moving', function (event) {
  ownLocation = [event.target.left, event.target.top]
  people[socket.id].location = ownLocation
  // Update distances
  for (const [userId, info] of Object.entries(people)) {
    if (userId!=socket.id) {
      people[userId].distance = distance(info.location, ownLocation)
    }
  }
  socket.emit('update_location', {
    roomId,
    location: people[socket.id][location]
  })
});

function moveSelected(direction) {
  var activeObject = canvas.getActiveObject();

  if (activeObject) {
    switch (direction) {
      case Direction.LEFT:
        activeObject.setLeft(activeObject.getLeft() - STEP);
        break;
      case Direction.UP:
        activeObject.setTop(activeObject.getTop() - STEP);
        break;
      case Direction.RIGHT:
        activeObject.setLeft(activeObject.getLeft() + STEP);
        break;
      case Direction.DOWN:
        activeObject.setTop(activeObject.getTop() + STEP);
        break;
    }
    activeObject.setCoords();
    people[socket.id][location] = [activeObject.left, activeObject.top]
    canvas.renderAll();
    socket.emit('update_location', {
      roomId,
      location: people[socket.id][location]
    })
}
