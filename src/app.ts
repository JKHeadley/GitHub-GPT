import express, { Request, Response } from "express";
import { Configuration, OpenAIApi } from "openai";
import bodyParser from "body-parser";
import { glob } from "glob";
import dotenv from "dotenv";
import fs from "fs";
import https from "https";
import { exec } from "child_process";

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

type FineTuneParams = {
  trainingFile: string;
  validationFile?: string | null;
  model: string;
  n_epochs: number | null;
  batch_size?: number | null;
  learning_rate_multiplier?: number | null;
  prompt_loss_weight?: number | null;
  compute_classification_metrics?: boolean | null;
  classification_n_classes?: number | null;
  classification_positive_class?: string | null;
  classification_betas?: Array<number> | null;
  suffix?: string | null;
};

const FineTuneParamsEnum = {
  trainingFile: "required",
  validationFile: "optional",
  model: "required",
  n_epochs: "required",
  batch_size: "optional",
  learning_rate_multiplier: "optional",
  prompt_loss_weight: "optional",
  compute_classification_metrics: "optional",
  classification_n_classes: "optional",
  classification_positive_class: "optional",
  classification_betas: "optional",
  suffix: "optional",
};

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// Preprocess the data from the repo
async function preprocessData(repoPath: string): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const filePaths = await glob(`${repoPath}/**/*.js`);

      let data: string[] = [];
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

      // Format data to be passed to the OpenAI API. The data should support the "jsonlines" format.
      data = data.map((line) => JSON.stringify(line));

      // Save the preprocessed data to a file
      fs.writeFileSync("./preprocessed-data.json", data.join("\n"));

      resolve(data);
    } catch (error) {
      reject(error);
    }
  });
}

// Download GitHub repository as a zip file
function downloadRepo(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve());
        });
      })
      .on("error", (error) => {
        fs.unlinkSync(destination);
        reject(error);
      });
  });
}

// Unzip the downloaded repo
function unzipRepo(zipPath: string, destination: string): Promise<string> {
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

// Parse the parameters and verify that they are valid based on the FineTuneParamsEnum
const parseParameters = (parameters: string): FineTuneParams => {
  const params: FineTuneParams = {
    trainingFile: "",
    model: "",
    n_epochs: 0,
    batch_size: 0,
  };
  const lines = parameters.split("\n");

  for (const line of lines) {
    const [key, value] = line.split(":");
    if (key && value) {
      const paramKey = key.trim();
      const paramValue = value.trim();

      if (Object.keys(FineTuneParamsEnum).includes(paramKey)) {
        // @ts-ignore
        params[paramKey] = paramValue;
      } else {
        throw new Error(`Invalid parameter: ${paramKey}`);
      }
    }
  }

  // Verify that all required parameters are present
  const requiredParams = Object.keys(FineTuneParamsEnum).filter(
    // @ts-ignore
    (key) => FineTuneParamsEnum[key] === "required"
  );
  for (const param of requiredParams) {
    // @ts-ignore
    if (!params[param]) {
      throw new Error(`Missing required parameter: ${param}`);
    }
  }

  return params;
};

// Fine-tune the GPT-4 model
async function fineTuneModel(params: FineTuneParams): Promise<string> {
  // Check that the preprocessed data file exists
  if (!fs.existsSync("./preprocessed-data.json")) {
    throw new Error("Preprocessed data file not found");
  }

  // Upload the data to OpenAI as a file
  const file = await openai.createFile(
    //@ts-ignore
    fs.createReadStream("./preprocessed-data.json"),
    "fine-tune"
  );

  const dataset = file.data;

  // Fine-tune the model
  const training = await openai.createFineTune({
    training_file: params.trainingFile,
    validation_file: params.validationFile,
    model: params.model,
    n_epochs: params.n_epochs,
    batch_size: params.batch_size,
    learning_rate_multiplier: params.learning_rate_multiplier,
    prompt_loss_weight: params.prompt_loss_weight,
    compute_classification_metrics: params.compute_classification_metrics,
    classification_n_classes: params.classification_n_classes,
    classification_positive_class: params.classification_positive_class,
    classification_betas: params.classification_betas,
    suffix: params.suffix,
  });

  return training.data.model;
}

app.post("/analyze-url", async (req: Request, res: Response) => {
  const githubUrl = req.body.githubUrl;

  try {
    const zipPath = "./repo.zip";
    const repoPath = "./repo";

    await downloadRepo(githubUrl, zipPath);
    await unzipRepo(zipPath, repoPath);

    const preprocessedData = await preprocessData(repoPath);

    const prompt = `Analyze the following preprocessed data from the GitHub repository "${githubUrl}" and suggest optimal parameters for fine-tuning a GPT-4 model:\n\n${preprocessedData}\n\nSuggested parameters: `;
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 100,
      n: 1,
      stop: null,
      temperature: 0.5,
    });

    // Get the suggested parameters from the response (handle undefined values)
    const choice = response?.data?.choices[0];
    const suggestedParameters = choice?.text?.trim();

    res.json({ suggestedParameters });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while processing the request." });
  }
});

app.post("/train-model", async (req: Request, res: Response) => {
  const parameters = req.body.parameters;

  // Check that the parameters are valid
  if (!parameters) {
    res.status(400).send("Invalid parameters");
    return;
  }

  const parsedParameters = parseParameters(parameters);

  try {
    const modelId = await fineTuneModel(parsedParameters);

    res.status(200).json({ modelId });
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to train the model");
  }
});

app.post("/generate", async (req: Request, res: Response) => {
  const prompt = req.body.prompt;
  const modelId = req.body.modelId;

  try {
    const response = await openai.createCompletion({
      model: modelId,
      prompt: prompt,
      max_tokens: 100,
      n: 1,
      stop: null,
      temperature: 0.8,
    });

    res.json({ text: response?.data.choices[0].text?.trim() });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the response." });
  }
});
