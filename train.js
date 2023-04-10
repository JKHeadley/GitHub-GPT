const https = require('https');
const { exec } = require('child_process');
const openai = require('openai');
const glob = require('glob');
const dotenv = require('dotenv');

// Set up OpenAI API credentials
openai.apiKey = process.env.OPENAI_API_KEY;

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
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
  
          for (const line of lines) {
            // Extract single-line comments
            if (line.trim().startsWith('//')) {
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
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', error => {
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
    file: data.join('\n'),
    purpose: 'fine-tuning',
  });

  // Fine-tune the model
  const training = await openai.FineTuning.create({
    model: 'gpt-4',
    dataset: file.id,
    // Adjust the parameters according to your needs and available resources
    n_epochs: 1,
    learning_rate: 0.0001,
  });

  return training.model;
}

// Main function
async function main() {
  const repoUrl = 'https://github.com/username/repo/archive/refs/heads/main.zip';
  const zipPath = './repo.zip';
  const repoPath = './repo';

  await downloadRepo(repoUrl, zipPath);
  await unzipRepo(zipPath, repoPath);

  const data = await preprocessData(repoPath);
  const model = await fineTuneModel(data);

  console.log('Fine-tuned model ID:', model);
}

main().catch(console.error);
