async function init() {
  myKeys = await generateKeys();
  console.log("Generated crypto keys.");

  userName = prompt("Enter your name:");
  if (!userName) {
    alert("A name is required to join the chat.");
    return;
  }
  document.getElementById("displayName").textContent = userName;
  connectToSignalingServer();
}

init();
