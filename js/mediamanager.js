// js/mediamanager.js

export class MediaManager {
    constructor(ui, stateManager, emitter) {
        this.ui = ui;
        this.stateManager = stateManager;
 this.emitter = emitter;
        this.dialingSound = this.ui.elements.dialingSound;
        this.ringingSound = this.ui.elements.ringingSound;
    }

    async getLocalStream(video = true, audio = true) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
 this.emitter.emit('media:localStreamAvailable', stream);
            this.ui.setLocalVideo(stream); // Assuming local video is always shown
            return stream;
        } catch (err) {
            console.error(`Error accessing media devices (video: ${video}, audio: ${audio}):`, err);
            this.ui.showNotification(
                `Could not access ${video ? 'camera and ' : ''}microphone. Please check permissions.`,
                "error"
            );
            throw err; // Re-throw to allow calling code to handle failure
        }
    }

    stopLocalStream() {
        const localStream = this.stateManager.getLocalStream();
        if (localStream) { // Check if stream exists before stopping tracks
 localStream.getTracks().forEach(track => track.stop());
 this.emitter.emit('media:localStreamStopped');
            this.ui.setLocalVideo(null);
        }
    }

    setRemoteMedia(stream) {
        if (stream.getVideoTracks().length > 0) {
            this.ui.setRemoteVideo(stream);
        } else {
            this.ui.setRemoteAudio(stream);
        }
    }

    clearRemoteMedia() {
        this.ui.setRemoteVideo(null);
 this.ui.setRemoteAudio(null); // Ensure remote audio is also cleared
        this.ui.setRemoteAudio(null);
    }

    playDialingSound() {
        this._playAudioWithLoop(this.dialingSound, 5); // Loop 5 times
    }

    stopDialingSound() {
        this._stopAudio(this.dialingSound);
    }

    playRingingSound() {
         this._playAudioWithLoop(this.ringingSound, 5); // Loop 5 times
    }

    stopRingingSound() {
        this._stopAudio(this.ringingSound);
    }

    toggleMute() {
        const localStream = this.stateManager.getLocalStream();
        if (!localStream) return;
 
        let isMuted = false;
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            isMuted = !track.enabled; // Determine the new mute state
        });
        this.ui.setMuteButtonState(isMuted);
 this.emitter.emit('media:micMuteToggle', isMuted);
    }

    // Helper function to play audio with a limited loop
    _playAudioWithLoop(audioElement, loopCount) {
        let playedCount = 0;
        audioElement.currentTime = 0; // Start from the beginning
        audioElement.loop = false; // Disable default loop

        const playOnce = () => {
            if (playedCount < loopCount) {
                const playPromise = audioElement.play();
                 if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                             playedCount++;
                        })
                        .catch((error) => {
                            console.error("Autoplay prevented: ", error);
                            // Handle cases where autoplay is blocked
                        });
                 } else {
                      // Fallback for older browsers or other issues
                      playedCount++;
                 }
            }
        };

         audioElement.onended = () => {
             if (playedCount < loopCount) {
                 audioElement.currentTime = 0; // Rewind
                 playOnce(); // Play the next loop
             }
         };

         // Start the first play
         playOnce();
    }


    // Helper function to stop audio
    _stopAudio(audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
        audioElement.onended = null; // Remove the loop handler
    }
}