import { View } from "./View.js";

export class CallView extends View {
  constructor() {
    super("#videoCallDialog");
    this.incomingCallModal = new View("#incomingCallModal");
    this.callerName = document.getElementById("callerName");
    this.incomingCallText = document.querySelector("#incomingCallModal h2");
    this.localVideo = document.getElementById("localVideo");
    this.remoteVideo = document.getElementById("remoteVideo");
    this.remoteAudio = document.getElementById("remoteAudio");
    this.voiceCallBtn = document.getElementById("voiceCallBtn");
    this.videoCallBtn = document.getElementById("videoCallBtn");
    this.voiceMuteBtn = document.getElementById("voiceMuteBtn");
    this.voiceHangUpBtn = document.getElementById("voiceHangUpBtn");
    this.muteBtn = document.getElementById("muteBtn");
  }

  render(state) {
    switch (state.state) {
      case "idle":
        this.renderIdleState();
        break;
      case "calling":
        this.renderCallingState();
        break;
      case "incoming":
        this.renderIncomingCall(state);
        break;
      case "active":
        this.renderActiveCall(state);
        break;
      case "ended":
        this.renderCallEnded();
        break;
    }
  }

  renderIdleState() {
    this.hide();
    this.incomingCallModal.hide();
    this.showCallButtons();
  }

  renderCallingState() {
    this.showCallButtons(false);
  }

  renderIncomingCall(state) {
    this.callerName.textContent = state.fromName;
    this.incomingCallText.textContent = state.isVideo
      ? "Incoming Video Call"
      : "Incoming Voice Call";
    this.incomingCallModal.show();
  }

  renderActiveCall(state) {
    this.incomingCallModal.hide();
    if (state.isVideo) {
      this.show();
    } else {
      this.showVoiceCallControls();
    }
  }

  renderCallEnded() {
    this.hide();
    this.incomingCallModal.hide();
    this.showCallButtons();
    this.localVideo.srcObject = null;
    this.remoteVideo.srcObject = null;
    this.remoteAudio.srcObject = null;
  }

  showCallButtons(show = true) {
    this.voiceCallBtn.style.display = show ? "block" : "none";
    this.videoCallBtn.style.display = show ? "block" : "none";
    this.voiceMuteBtn.style.display = "none";
    this.voiceHangUpBtn.style.display = "none";
  }

  showVoiceCallControls() {
    this.voiceCallBtn.style.display = "none";
    this.videoCallBtn.style.display = "none";
    this.voiceMuteBtn.style.display = "block";
    this.voiceHangUpBtn.style.display = "block";
  }

  updateMuteButton(isMuted) {
    const icon = isMuted
      ? '<i class="fas fa-microphone-slash"></i>'
      : '<i class="fas fa-microphone"></i>';
    this.muteBtn.innerHTML = icon;
    this.voiceMuteBtn.innerHTML = icon;
  }

  setLocalStream(stream) {
    this.localVideo.srcObject = stream;
  }

  setRemoteStream(stream, isVideo) {
    if (isVideo) {
      this.remoteVideo.srcObject = stream;
    } else {
      this.remoteAudio.srcObject = stream;
    }
  }
}
