// DOM elements.
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')

const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('local-video')
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
let people = {}
let audioObjects = {
  /**loop1: {
    location: [250,150],
    player: document.getElementById('loop1')
  },
  loop2: {
    location: [750,150],
    player: document.getElementById('loop2')
  },**/
  radio2: {
    location: [500,500],
    player: document.getElementById('radio2')
  },
}

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

// Place jukeboxes
for (const [audioId, info] of Object.entries(audioObjects)) {
  fabric.loadSVGFromURL('borrelio/jukebox.svg',function(objects, options){
    var svgData = fabric.util.groupSVGElements(objects, options);
    svgData.top = info.location[1];
    svgData.left = info.location[0];
    svgData.selectable = false;
    svgData.hasControls = false;
    svgData.scaleToHeight(50);
    canvas.add(svgData);
  });
}


function distance(l1, l2) {
  return (
      (l1[0] - l2[0])**2
      + (l1[1]-l2[1])**2
  ) ** 0.5
}

function updateDistances() {
  const ownLocation = people[socket.id].location;
  for (const [userId, info] of Object.entries(people)) {
    if (userId!=socket.id) {
      people[userId].distance = distance(info.location, ownLocation)
    }
  }
  for (const [audioId, info] of Object.entries(audioObjects)) {
    audioObjects[audioId].distance = distance(info.location,ownLocation)
  }
}

// Returns the audio volume for a given distance. Between distance 50 and 350, the volume decreases linearly.
function volume(dist) {
  if (dist<50) {
    return 1;
  } else if (dist<350) {
    return (1-(dist-50) / 300.0)**2;
  } else {
    return 0;
  }
}

function updateVolumes() {
  for (const [userId, video] of Object.entries(remoteVideoComponents)) {
    if (people[userId]) {
      video.volume = volume(people[userId].distance);
    } else {
      // Delete the video otherwise
      video.parentElement.remove();
    }

  }
  for (const [id, info] of Object.entries(audioObjects)) {
    info.player.volume = volume(info.distance);
    if (info.player.paused && info.player.volume>0) {
      info.player.play();
    }
  }
}

// SOCKET EVENT CALLBACKS =====================================================
socket.on('users', async (roomUsers) => {
  console.log('Socket event callback: users')
  console.log(roomUsers);
  const oldPeople = people;
  people = roomUsers;
  for (const [userId, info] of Object.entries(roomUsers)) {
    if (oldPeople.hasOwnProperty(userId)) {
      people[userId].avatar = oldPeople[userId].avatar;
      people[userId].avatar.changeName(info.name);
      updateAvatarPosition(people[userId].avatar, info.location);
      delete oldPeople[userId];
    } else {
      people[userId].avatar = initializeAvatar(info.location, info.name, userId === socket.id);
    }
  }
  // See which users do not exist anymore
  for (const [userId, info] of Object.entries(oldPeople)) {
    // Delete video player
    if (remoteVideoComponents[userId]) {
      remoteVideoComponents[userId].parentElement.remove();
    }
    // Delete avatar
    canvas.remove(info.avatar);
  }
  updateDistances();
  canvas.renderAll();
  updateVolumes();
})

function updateAvatarPosition(avatar, location) {
  if (!Array.isArray(location) || location.length!=2) {
    // This seems to happen sometimes for some reason?
    console.log('Updating avatar to invalid location '+location);
    console.log(avatar);
    return;
  }
  avatar.setLeft(location[0]);
  avatar.setTop(location[1]);
  avatar.setCoords();
}

function initializeAvatar(location, name, own) {
  const circle = new fabric.Circle({
    left: location[0],
    top: location[1],
    radius: 25,
    fill: own ? '#138913' : '#a21818',
    lockUniScaling: true,
    hasControls: false,
    opacity: 0.5,
    hasBorders: false,
    selectable: false,
    evented: false
  });
  const text = new fabric.Text(name, {
    fontFamily: 'Calibri',
    fontSize: 16,
    textAlign: 'center',
    originX: 'center',
    originY: 'center',
    left: location[0] + 25,
    top: location[1] + 25
  });
  const avatar = new fabric.Group([circle, text], {
    lockUniScaling: true,
    hasControls: false,
    hasBorders: false,
    selectable: own,
    evented: own
  });
  avatar.changeName = function(newName) {
    text.text = newName;
    // Set dirty to true, because else it will not re-render
    avatar.dirty = true;
  }
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

socket.on('start_call', async event => {
  console.log('Socket event callback: start_call');

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

  if (socket.id === event.userId) {
    var rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = e => setRemoteStream(e, event.senderId);
    rtcPeerConnection.onicecandidate = e => sendIceCandidate(e, event.senderId)
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event.sdp))
    rtcPeerConnections[event.senderId] = rtcPeerConnection;
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
  }
}

async function setLocalStream(mediaConstraints) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  } catch (error) {
    console.error('Could not get user media', error)
  }

  localStream = stream
  localVideoComponent.srcObject = stream
  localVideoComponent.volume = 0;
}

function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
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

fabric.util.addListener(document.body, 'keydown', function(options) {
  var key = options.which || options.keyCode; // key detection
  if (key === 37) { // handle Left key
    moveAvatar(Direction.LEFT);
  } else if (key === 38) { // handle Up key
    moveAvatar(Direction.UP);
  } else if (key === 39) { // handle Right key
    moveAvatar(Direction.RIGHT);
  } else if (key === 40) { // handle Down key
    moveAvatar(Direction.DOWN);
  }
});

canvas.on('object:moving', function (event) {
  const ownLocation = [event.target.left, event.target.top]
  people[socket.id].location = ownLocation

  socket.emit('update_location', {
    roomId,
    location: ownLocation
  })
  updateDistances();
  updateVolumes();
});

localVideoComponent.onclick = function(e) {
  //clicked on object
  let newName = window.prompt('Choose your name',people[socket.id].name);
  if (newName) {
    people[socket.id].avatar.changeName(newName);
    canvas.renderAll();
    socket.emit('update_name', {
      roomId,
      newName
    });
  }
}

function moveAvatar(direction) {
  const avatar = people[socket.id].avatar;

  if (avatar) {
    switch (direction) {
      case Direction.LEFT:
        avatar.setLeft(avatar.getLeft() - STEP);
        break;
      case Direction.UP:
        avatar.setTop(avatar.getTop() - STEP);
        break;
      case Direction.RIGHT:
        avatar.setLeft(avatar.getLeft() + STEP);
        break;
      case Direction.DOWN:
        avatar.setTop(avatar.getTop() + STEP);
        break;
    }
    avatar.setCoords();
    people[socket.id].location = [avatar.left, avatar.top]
    updateDistances();
    canvas.renderAll();
    socket.emit('update_location', {
      roomId,
      location: people[socket.id].location
    })
    updateVolumes()
  }
}

// Prompt for a room name
roomName = window.prompt("Please enter the room name",'1');
joinRoom(roomName);
