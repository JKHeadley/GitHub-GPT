const express = require("express");
const openai = require("openai");
const bodyParser = require("body-parser");
const glob = require("glob");
const dotenv = require("dotenv");

// Set up OpenAI API credentials
openai.apiKey = process.env.OPENAI_API_KEY;

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// Preprocess the data from the repo
async function preprocessData(repoPath) {
  return new Promise((resolve, reject) => {
    glob(`${repoPath}/**/*.js`, async (error, filePaths) => {
      if (error) {
        reject(error);
        return;
      }

      let data = [];
      for (const filePath of filePaths) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        for (const line of lines) {
          // Extract single-line comments
          if (line.trim().startsWith("//")) {
            data.push(line.trim());
          }
          // Extract code snippets
          else if (line.trim()) {
            data.push(line.trim());
          }
        }
      }

      resolve(data);
    });
  });
}

// Download GitHub repository as a zip file
function downloadRepo(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (error) => {
        fs.unlink(destination);
        reject(error);
      });
  });
}

// Unzip the downloaded repo
function unzipRepo(zipPath, destination) {
  return new Promise((resolve, reject) => {
    exec(`unzip ${zipPath} -d ${destination}`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(destination);
      }
    });
  });
}

// Fine-tune the GPT-4 model
async function fineTuneModel(data) {
  // Upload the data to OpenAI as a file
  const file = await openai.File.create({
    file: data.join("\n"),
    purpose: "fine-tuning",
  });

  // Fine-tune the model
  const training = await openai.FineTuning.create({
    model: "gpt-4",
    dataset: file.id,
    // Adjust the parameters according to your needs and available resources
    n_epochs: 1,
    learning_rate: 0.0001,
  });

  return training.model;
}

// Add this after setting up the Express app and before starting the server
app.post("/analyze-url", async (req, res) => {
  const githubUrl = req.body.githubUrl;

  try {
    // Download the repo, unzip, and preprocess the data (reuse the functions from previous examples)
    const zipPath = "./repo.zip";
    const repoPath = "./repo";

    await downloadRepo(repoUrl, zipPath);
    await unzipRepo(zipPath, repoPath);

    const preprocessedData = await preprocessData(repoPath);

    // Analyze the preprocessed data and suggest optimal parameters
    const prompt = `Analyze the following preprocessed data from the GitHub repository "${githubUrl}" and suggest optimal parameters for fine-tuning a GPT-4 model:\n\n${preprocessedData}\n\nSuggested parameters: `;
    const response = await openai.Completion.create({
      model: "text-davinci-002", // Replace with your preferred base model
      prompt: prompt,
      max_tokens: 200,
      n: 1,
      stop: null,
      temperature: 0.8,
    });

    res.json({ text: response.choices[0].text.trim() });
  } catch (error) {
    res.status(500).json({ error: "Error generating response" });
  }
});

app.post("/train-model", async (req, res) => {
  const parameters = req.body.parameters;
  const preprocessedData = req.body.preprocessedData;

  try {
    const model = await fineTuneModel(preprocessedData, parameters);

    console.log("Fine-tuned model ID:", model);

    res.status(200).json({ modelId: model });
  } catch (error) {
    res.status(500).send("Failed to train the model");
  }
});

app.post("/generate", async (req, res) => {
  const prompt = req.body.prompt;
  const modelId = req.body.modelId;
  const conversationHistory = req.body.conversationHistory;

  try {
    const response = await openai.Completion.create({
      model: modelId,
      prompt: `${conversationHistory}${prompt}`,
      max_tokens: 100,
      n: 1,
      stop: null,
      temperature: 0.8,
    });

    res.json({ text: response.choices[0].text.trim() });
  } catch (error) {
    res.status(500).json({ error: "Error generating response" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
