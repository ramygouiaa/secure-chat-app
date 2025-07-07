const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const recordBtn = document.getElementById("recordBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const voiceCallBtn = document.getElementById("voiceCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");
const hangUpBtn = document.getElementById("hangUpBtn");
const videoContainer = document.getElementById("videoContainer");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesContainer = document.getElementById("messagesContainer");
const contactsList = document.getElementById("contactsList");
const sidebar = document.getElementById("sidebar");
const openSidebarBtn = document.getElementById("openSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const chatWith = document.getElementById("chatWith");
const connectionStatus = document.getElementById("connectionStatus");
const notification = document.getElementById("notification");
const incomingCallModal = document.getElementById("incomingCallModal");
const callerName = document.getElementById("callerName");
const answerCallBtn = document.getElementById("answerCallBtn");
const declineCallBtn = document.getElementById("declineCallBtn");
const incomingCallText = document.querySelector("#incomingCallModal h2");
const remoteAudio = document.getElementById("remoteAudio");
const muteBtn = document.getElementById("muteBtn");
const dialingSound = document.getElementById("dialingSound");
const ringingSound = document.getElementById("ringingSound");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");

const ICE_SERVERS = [
  {
    urls: "stun:stun.relay.metered.ca:80",
  },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: "64a842e9e0257e8c336c930b",
    credential: "kC6B4K9z5X/Eo/kf",
  },
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: "64a842e9e0257e8c336c930b",
    credential: "kC6B4K9z5X/Eo/kf",
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: "64a842e9e0257e8c336c930b",
    credential: "kC6B4K9z5X/Eo/kf",
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=tcp",
    username: "64a842e9e0257e8c336c930b",
    credential: "kC6B4K9z5X/Eo/kf",
  },
];

let socket;
let clientId = null;
let userName = null;
let currentTargetId = null;
let currentTargetName = null;
let peers = {};
let localConnection = null;
let dataChannel = null;
let discussions = {};
let typingTimeout = null;
let mediaRecorder = null;
let recordedChunks = [];
const fileChunks = new Map();
let localStream = null;
let myKeys = null;
let sharedSecrets = {}; // targetId -> shared secret
let incomingOffer = null;
let callInitiatorId = null;
let isVideoCall = false;
let callStartTime = null;
