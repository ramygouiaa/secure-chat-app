let device;
let rtpCapabilities;
let sendTransport;
let recvTransport;
let videoProducer; // Global variable for video producer
let audioProducer; // Global variable for audio producer
let consumers = new Map();

async function connectToSfu() {
  updateConnectionStatus("Connecting to media server...");
  socket.send(JSON.stringify({ type: "getRouterRtpCapabilities" }));
}

async function createDevice() {
  try {
    device = new mediasoup.Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    console.log("Mediasoup device created");
  } catch (error) {
    console.error("Error creating Mediasoup device:", error);
  }
}

async function createSendTransport() {
  socket.send(
    JSON.stringify({
      type: "createWebRtcTransport",
      forceTcp: false,
      producing: true,
      consuming: false,
    })
  );
}

async function createRecvTransport() {
  socket.send(
    JSON.stringify({
      type: "createWebRtcTransport",
      forceTcp: false,
      producing: false,
      consuming: true,
    })
  );
}

async function connectSendTransport() {
  try {
    updateConnectionStatus("Publishing media...");
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];

    // Produce video
    if (videoTrack) {
      videoProducer = await sendTransport.produce({
        track: videoTrack,
        encodings: [
          { maxBitrate: 100000 },
          { maxBitrate: 300000 },
          { maxBitrate: 900000 },
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
      });
      videoProducer.on("trackended", () => console.log("Video track ended"));
      videoProducer.on("transportclose", () =>
        console.log("Transport for video track ended")
      );
    }

    // Produce audio
    if (audioTrack) {
      audioProducer = await sendTransport.produce({ track: audioTrack });
      audioProducer.on("trackended", () => console.log("Audio track ended"));
      audioProducer.on("transportclose", () =>
        console.log("Transport for audio track ended")
      );
    }

    updateConnectionStatus("Media published. Waiting for peer...");
  } catch (error) {
    console.error("Error producing media:", error);
    showNotification("Failed to publish media.", "error");
    hangUp();
  }
}

async function consume(producerId) {
  const { rtpCapabilities } = device;
  socket.send(
    JSON.stringify({
      type: "consume",
      payload: {
        rtpCapabilities,
        producerId,
        transportId: recvTransport.id,
      },
    })
  );
}

// This function will be called from signaling.js
async function handleConsume(data) {
  const { id, producerId, kind, rtpParameters } = data;

  let codecOptions = {};
  try {
    const consumer = await recvTransport.consume({
      id,
      producerId,
      kind,
      rtpParameters,
      codecOptions,
    });

    console.log("Consumer created:", consumer);
    console.log("Consumer track:", consumer.track);

    // Ensure remoteVideo.srcObject is the primary stream for both audio and video
    const remoteStream = remoteVideo.srcObject || new MediaStream();
    remoteStream.addTrack(consumer.track);
    remoteVideo.srcObject = remoteStream;
    console.log(
      "remoteVideo.srcObject after adding track:",
      remoteVideo.srcObject
    );

    // If there's a separate remoteAudio element, and it's an audio track, assign it there too.
    if (kind === "audio" && remoteAudio) {
      remoteAudio.srcObject = remoteStream;
    }

    // Resume the consumer to start receiving media
    socket.send(
      JSON.stringify({ type: "resume", payload: { consumerId: consumer.id } })
    );

    consumers.set(consumer.id, consumer);
    updateConnectionStatus("Call in progress...");
  } catch (error) {
    console.error("Error consuming media:", error);
    showNotification("Failed to consume media.", "error");
  }
}

function setupSfuEventHandlers() {
  // This will be called from the main signaling logic
  // to handle SFU-specific messages
}
