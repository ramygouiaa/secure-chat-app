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

// Show the welcome modal on page load
document.addEventListener("DOMContentLoaded", () => {
  welcomeModal.classList.remove("hidden");
});

enterChatBtn.onclick = () => {
  welcomeModal.classList.add("hidden");
  init();
};
