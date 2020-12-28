// DOM elements.
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')

const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('video-1')
const remoteVideoComponents = {};

// Variables.
const socket = io()
const mediaConstraints = {
  audio: true,
  video: { width: 1280, height: 720 },
}
let localStream
let remoteStream
let isRoomCreator
let rtcPeerConnections = {};// Connection between the local device and the remote peer.
let roomId
let locations

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

// BUTTON LISTENER ============================================================
connectButton.addEventListener('click', () => {
  joinRoom(roomInput.value);

  setTimeout(() => {
    console.log('Updating my location.')
    locations[socket.id] = [1, 1];
    socket.emit('update_location', {
      roomId,
      location: locations[socket.id]
    })
  }, 1000)
})

// SOCKET EVENT CALLBACKS =====================================================
socket.on('locations', async (roomLocations) => {
  console.log('Socket event callback: locations')

  locations = roomLocations;
  console.log(socket.id, locations);
})


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

socket.on('start_call', async event => {
  console.log('Socket event callback: start_call');
  console.log(event.userId);

  if (socket.id !== event.userId) {
    var rtcPeerConnection = new RTCPeerConnection(iceServers);
    addLocalTracks(rtcPeerConnection);
    rtcPeerConnection.ontrack = e => setRemoteStream(e, event.userId);
    rtcPeerConnection.onicecandidate = e => sendIceCandidate(e, event.userId);
    rtcPeerConnections[event.userId] = rtcPeerConnection;
    await createOffer(rtcPeerConnection, event.userId);
  };
})

socket.on('webrtc_offer', async (event) => {
  console.log('Socket event callback: webrtc_offer')
  //console.log(socket.id);
  //console.log(event.userId);

  if (socket.id === event.userId) {
    var rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = e => setRemoteStream(e, event.senderId);
    rtcPeerConnection.onicecandidate = e => sendIceCandidate(e, event.senderId)
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event.sdp))
    rtcPeerConnections[event.senderId] = rtcPeerConnection;
    console.log(rtcPeerConnections);
    await createAnswer(rtcPeerConnection, event.senderId)
  }
})

socket.on('webrtc_answer', (event) => {
  console.log('Socket event callback: webrtc_answer')

  if (socket.id === event.userId)
    rtcPeerConnections[event.senderId].setRemoteDescription(new RTCSessionDescription(event.sdp))
})

socket.on('webrtc_ice_candidate', (event) => {
  console.log('Socket event callback: webrtc_ice_candidate')
  //console.log(event.userId)
  //console.log(rtcPeerConnections);
  if (socket.id === event.userId) {
    // ICE candidate configuration.
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: event.label,
      candidate: event.candidate,
    })
    rtcPeerConnections[event.senderId].addIceCandidate(candidate)
  } 
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

async function createOffer(rtcPeerConnection, userId) {
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
    userId
  })
}

async function createAnswer(rtcPeerConnection, userId) {
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
    userId
  })
}

function setRemoteStream(event, userId) {
  if (remoteVideoComponents[userId]) {
    // TODO: find out why this is needed
    return;
  }

  var newVideoComponent = createVideo();
  newVideoComponent.srcObject = event.streams[0];
  remoteVideoComponents[userId] = newVideoComponent;
}

function sendIceCandidate(event, userId) {
  if (event.candidate) {
    socket.emit('webrtc_ice_candidate', {
      roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
      userId
    })
  }
}

function createVideo() {
  var videoPanel = document.getElementById("video-panel");
  var div = document.createElement("div");
  var video = document.createElement("video");
  video.setAttribute("class", "video-container")
  video.setAttribute("autoplay", "autoplay");
  video.setAttribute("muted", "muted");
  div.appendChild(video);
  videoPanel.appendChild(div);

  return video;
}

window.onbeforeunload = function ()
{
  socket.emit('leave', roomId)
}