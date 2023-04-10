const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const messages = document.getElementById("messages");
const analyzeUrlButton = document.getElementById("analyze-url");
const githubUrlInput = document.getElementById("github-url");
const trainModelButton = document.getElementById("train-model");
const parameterMessageForm = document.getElementById(
  "parameter-message-submit"
);
const parameterMessageInput = document.getElementById(
  "parameter-message-input"
);

// Add this variable at the beginning of the script.js file
let conversationHistory = "";
let fineTunedModelId = null;

parameterMessageForm.addEventListener("click", async (event) => {
  event.preventDefault();

  const userMessage = parameterMessageInput.value.trim();
  if (!userMessage) return;

  conversationHistory += `User: ${userMessage}\n`;
  const prompt = `${conversationHistory}GPT-4 Assistant: `;

  addMessage("User", userMessage);
  parameterMessageInput.value = "";

  const modelId = "text-davinci-002";

  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, modelId }),
    });

    if (response.ok) {
      const data = await response.json();
      addMessage("GPT-4 Assistant", data.text);
      if (data.text.includes("Suggested parameters:")) {
        updateSuggestedParameters(
          data.text.split("Suggested parameters:")[1].trim()
        );
      }
    } else {
      addMessage("Error", "Failed to generate response");
    }
  } catch (error) {
    addMessage("Error", "Failed to generate response");
  }
});

analyzeUrlButton.addEventListener("click", async () => {
  const githubUrl = githubUrlInput.value.trim();
  if (!githubUrl) return;

  conversationHistory += `Analyze the following preprocessed data from the GitHub repository "${githubUrl}" and suggest optimal parameters for fine-tuning a GPT-4 model:\n\n${preprocessedData}\n\nSuggested parameters: `;

  try {
    const response = await fetch("/analyze-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ githubUrl }),
    });

    if (response.ok) {
      const data = await response.json();
      addMessage("GPT-4 Assistant", data.text);
      updateSuggestedParameters(data.text);

      trainModelButton.disabled = false;
    } else {
      addMessage("Error", "Failed to analyze the repository");
    }
  } catch (error) {
    addMessage("Error", "Failed to analyze the repository");
  }
});

// Add a new event listener for the trainModelButton
trainModelButton.addEventListener("click", async () => {
  trainModelButton.disabled = true;
  addMessage("System", "Training the model, please wait...");

  try {
    const response = await fetch("/train-model", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parameters: "your_parameters", // Pass the parameters chosen by the user
        preprocessedData: preprocessedData,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      fineTunedModelId = data.modelId;
      addMessage(
        "System",
        "Model training completed. You can now chat with the fine-tuned model."
      );
    } else {
      addMessage("Error", "Failed to train the model");
    }
  } catch (error) {
    addMessage("Error", "Failed to train the model");
  }

  trainModelButton.disabled = false;
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!fineTunedModelId) {
    addMessage("Error", "Fine-tuned model is not available yet");
    return;
  }

  const userMessage = messageInput.value.trim();
  if (!userMessage) return;

  conversationHistory += `User: ${userMessage}\n`;
  const prompt = `GPT-4 Assistant: `;

  addMessage("User", userMessage);
  messageInput.value = "";

  const modelId = "your_fine_tuned_model_id";

  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, modelId }),
    });

    if (response.ok) {
      const data = await response.json();
      addMessage("GPT-4 Assistant", data.text);
      if (data.text.includes("Suggested parameters:")) {
        updateSuggestedParameters(
          data.text.split("Suggested parameters:")[1].trim()
        );
      }
    } else {
      addMessage("Error", "Failed to generate response");
    }
  } catch (error) {
    addMessage("Error", "Failed to generate response");
  }
});

function addMessage(sender, text) {
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  messageElement.textContent = `${sender}: ${text}`;
  messages.appendChild(messageElement);
  messages.scrollTop = messages.scrollHeight;
}

function updateSuggestedParameters(text) {
  const parametersText = document.getElementById("parameters-text");
  parametersText.textContent = text;
}
